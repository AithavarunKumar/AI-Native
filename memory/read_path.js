'use strict';

const { pool } = require('./db');

// ---------------------------------------------------------------------------
// Token estimation  —  1 token ≈ 4 chars (GPT/Claude approximation).
// Documented limitation: this is a character-count heuristic, not a real
// tokeniser. Actual token counts vary by content; this is accurate to ±20%.
// ---------------------------------------------------------------------------
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Keyword extraction for relevance scoring.
//
// Underscores are replaced with spaces first so that identifiers like
// TRAVEL_BUFFER_MINUTES or active_reservation_quantities split correctly
// into their component terms before the word-boundary split.
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'the','a','an','is','it','in','of','for','to','and','or','with','as',
  'by','at','be','are','was','were','this','that','from','on','not','but',
  'has','have','had','will','would','should','any','all','its','also',
  'does','which','into','than','more','they','been','their','what','when',
  'can','may','must','each','only','both','about','how','its','use','used',
]);

function extractTerms(text) {
  return text
    .toLowerCase()
    .replace(/_/g, ' ')        // treat snake_case as separate words
    .split(/\W+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// Keyword overlap relevance: fraction of query terms found in content.
// Duplicate query terms count multiple times (rewards dense topical overlap).
function scoreRelevance(content, queryTerms) {
  if (!queryTerms.length) return 0;
  const contentSet = new Set(extractTerms(content));
  const matched = queryTerms.filter(t => contentSet.has(t)).length;
  return matched / queryTerms.length;
}

// ---------------------------------------------------------------------------
// Namespace isolation
//
// Repo is extracted from any namespace style:
//   'repo:serviceforge'               → 'serviceforge'
//   'serviceforge:day4-kata:dev'      → 'serviceforge'
// The SQL query then restricts to 'repo:{repo}' OR '{repo}:*' — preventing
// memories from any other repository from leaking into the context.
// ---------------------------------------------------------------------------
function extractRepo(namespace) {
  if (namespace.startsWith('repo:')) return namespace.slice(5).split(':')[0];
  return namespace.split(':')[0];
}

// ---------------------------------------------------------------------------
// retrieve(query, options)
//
// Implements the three-stage JIT loading defined in memory-architecture.md §1.5.
//
// Stage 1 — Bootstrap  (≤ 150 tokens)
//   semantic + open_question memories, highest relevance first.
//
// Stage 2 — Task-time  (≤ 250 tokens)
//   episodic_decision memories, highest relevance + recency first.
//
// Stage 3 — On-demand  (≤ 100 tokens)
//   any remaining memories with relevance > 0, only if budget allows.
//
// Total ceiling: 500 tokens.
// ---------------------------------------------------------------------------
async function retrieve(query, options = {}) {
  const {
    namespace = 'repo:serviceforge',
    budgets   = { bootstrap: 150, taskTime: 250, onDemand: 100, total: 500 },
  } = options;

  const repo = extractRepo(namespace);

  // Namespace isolation: fetch only memories within this repo's scope.
  const { rows } = await pool.query(
    `SELECT id, namespace, type_tag, content, source_task, status, timestamp
     FROM memories
     WHERE (namespace = $1 OR namespace LIKE $2)
     ORDER BY timestamp DESC`,
    [`repo:${repo}`, `${repo}:%`]
  );

  const queryTerms = extractTerms(query);
  const scored = rows.map(row => ({
    ...row,
    relevance: scoreRelevance(row.content, queryTerms),
    tokens:    estimateTokens(row.content),
  }));

  const selected = [];
  let bt = 0, tt = 0, od = 0;

  // ── Stage 1: Bootstrap ──────────────────────────────────────────────────
  const bootItems = scored
    .filter(r => ['semantic', 'open_question'].includes(r.type_tag))
    .sort((a, b) => b.relevance - a.relevance || new Date(b.timestamp) - new Date(a.timestamp));

  for (const item of bootItems) {
    if (bt + item.tokens > budgets.bootstrap) continue;        // too large for remaining bootstrap budget
    if (bt + tt + od + item.tokens > budgets.total) break;    // exhausted total budget
    selected.push({ ...item, stage: 'bootstrap' });
    bt += item.tokens;
  }

  // ── Stage 2: Task-time ──────────────────────────────────────────────────
  const taskItems = scored
    .filter(r => r.type_tag === 'episodic_decision')
    .filter(r => !selected.find(s => s.id === r.id))
    .sort((a, b) => b.relevance - a.relevance || new Date(b.timestamp) - new Date(a.timestamp));

  for (const item of taskItems) {
    if (tt + item.tokens > budgets.taskTime) continue;
    if (bt + tt + od + item.tokens > budgets.total) break;
    selected.push({ ...item, stage: 'task-time' });
    tt += item.tokens;
  }

  // ── Stage 3: On-demand ──────────────────────────────────────────────────
  // Only fire for memories with relevance > 0 — no blank filler.
  const odItems = scored
    .filter(r => r.relevance > 0)
    .filter(r => !selected.find(s => s.id === r.id))
    .sort((a, b) => b.relevance - a.relevance);

  for (const item of odItems) {
    if (od + item.tokens > budgets.onDemand) continue;
    if (bt + tt + od + item.tokens > budgets.total) break;
    selected.push({ ...item, stage: 'on-demand' });
    od += item.tokens;
  }

  return {
    query,
    repo,
    namespace_queried: [`repo:${repo}`, `${repo}:*`],
    total_rows_fetched: rows.length,
    selected,
    token_usage: { bootstrap: bt, task_time: tt, on_demand: od, total: bt + tt + od },
    budget: budgets,
    excluded_count: rows.length - selected.length,
  };
}

// ---------------------------------------------------------------------------
// formatContext — renders the retrieval result as a context injection block.
// ---------------------------------------------------------------------------
function formatContext(result) {
  const { token_usage: tu, budget, selected, namespace_queried } = result;
  const lines = [
    `=== Injected Memory Context ===`,
    `Scope  : ${namespace_queried.join(', ')}`,
    `Tokens : ${tu.total} / ${budget.total} budget  ` +
      `[bootstrap=${tu.bootstrap}  task-time=${tu.task_time}  on-demand=${tu.on_demand}]`,
    `Items  : ${selected.length}`,
    '',
  ];
  for (const m of selected) {
    lines.push(
      `[${m.stage.toUpperCase().padEnd(10)}]` +
      `[${m.type_tag.padEnd(18)}]` +
      `[ns: ${m.namespace}]`
    );
    lines.push(m.content);
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { retrieve, formatContext, estimateTokens, extractTerms, scoreRelevance };
