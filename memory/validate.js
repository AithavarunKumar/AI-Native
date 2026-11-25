'use strict';

/**
 * End-to-end validation for the ServiceForge Memory Management Pipeline.
 * Covers Parts 1 (write path), 2 (read path), and produces evidence for
 * the Part 3 audit report.
 *
 * Run:  node validate.js
 */

const path = require('path');
const { pool, initDb }                        = require('./db');
const { enqueueMemoryWrite, seedFromFile }    = require('./write_path');
const { retrieve, formatContext, estimateTokens, scoreRelevance, extractTerms }
                                              = require('./read_path');

// ── Helpers ─────────────────────────────────────────────────────────────────

const evidence = [];          // collects PASS/FAIL records for the audit report

function check(label, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  const line = `  ${status}: ${label}`;
  evidence.push({ label, status, detail });
  console.log(line + (detail ? `  [${detail}]` : ''));
  return condition;
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(70));
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('='.repeat(70));
  console.log('  ServiceForge Memory Pipeline — End-to-End Validation');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  // ════════════════════════════════════════════════════════════════════════════
  // SETUP — fresh DB state so row counts are deterministic
  // ════════════════════════════════════════════════════════════════════════════
  section('SETUP');
  await initDb();
  await pool.query('TRUNCATE memories RESTART IDENTITY');
  const seedFile = path.join(__dirname, 'memory_store.json');
  const seeds = await seedFromFile(seedFile);
  const retained  = seeds.filter(s =>  s.stored);
  const discarded = seeds.filter(s => !s.stored);
  console.log(`  Seeded: ${seeds.length} candidates → ${retained.length} retained, ${discarded.length} discarded`);

  // ════════════════════════════════════════════════════════════════════════════
  // PART 1 — Write Path
  // ════════════════════════════════════════════════════════════════════════════
  section('PART 1 — Write Path');

  // 1a–1b: Retain / Discard counts
  check('1a. Retain filter: 7 seeds stored',    retained.length  === 7, `actual=${retained.length}`);
  check('1b. Discard filter: 4 seeds dropped',  discarded.length === 4, `actual=${discarded.length}`);

  // 1c–1e: Specific discard reasons
  check('1c. git_operation discarded',         discarded.some(d => d.reason.includes('git_operation')));
  check('1d. raw_output discarded',            discarded.some(d => d.reason.includes('raw_output')));
  check('1e. unconfirmed assumption discarded',discarded.some(d => d.reason.includes('unconfirmed')));

  // 1f: Provenance fields on every stored row
  const { rows: allRows } = await pool.query(
    'SELECT id, namespace, type_tag, source_task, status, timestamp FROM memories'
  );
  const incomplete = allRows.filter(r => !r.namespace || !r.type_tag || !r.source_task || !r.status || !r.timestamp);
  check('1f. All rows have required provenance fields', incomplete.length === 0,
        `rows=${allRows.length} incomplete=${incomplete.length}`);

  // 1g–1h: Non-blocking hook
  let hookResult = null;
  const beforeHook = hookResult;             // null — hook hasn't fired yet
  enqueueMemoryWrite({
    namespace:   'serviceforge:day4-memory-architecture:dev',
    type_tag:    'episodic_decision',
    content:     'Part-1 validation non-blocking hook test: hook fires via setImmediate after main call stack returns.',
    source_task: 'kata-validate',
    status:      'active',
  }, (err, r) => { hookResult = r; });

  const firedBeforeReturn = hookResult !== null;   // must be false (setImmediate is async)
  await new Promise(r => setTimeout(r, 300));      // allow event loop to drain

  check('1g. Hook is non-blocking: null immediately after enqueue', !firedBeforeReturn,
        `firedBeforeReturn=${firedBeforeReturn}`);
  check('1h. Hook fires within 300ms',  hookResult?.stored === true,
        `stored=${hookResult?.stored}  id=${hookResult?.id}`);

  // 1i–1j: Round-trip  —  write a Feature 1 decision via hook, then retrieve it
  section('PART 1 — Round-Trip (write → read)');

  let roundTripId = null;
  await new Promise((resolve, reject) => {
    enqueueMemoryWrite({
      namespace:   'repo:serviceforge',
      type_tag:    'semantic',
      content:     'Round-trip test: TRAVEL_BUFFER_MINUTES = 45. ' +
                   'Feature 1 technician scheduling constant. ' +
                   'Required by Feature 2 to reason about daily job capacity and travel buffer.',
      source_task: 'kata-round-trip',
      status:      'active',
    }, (err, r) => {
      if (err) reject(err);
      else { roundTripId = r?.id ?? null; resolve(r); }
    });
  });
  check('1i. Round-trip write: memory persisted via hook', roundTripId !== null,
        `id=${roundTripId}`);

  const rtResult = await retrieve('travel buffer technician scheduling', {
    namespace: 'serviceforge:day4-memory-architecture:dev',
  });
  const rtFound = rtResult.selected.find(m => m.id === roundTripId);
  check('1j. Round-trip read: written memory retrieved from DB', Boolean(rtFound),
        `id=${roundTripId} stage=${rtFound?.stage} relevance=${rtFound?.relevance?.toFixed(3)}`);

  // ════════════════════════════════════════════════════════════════════════════
  // PART 2 — Read Path  (Feature 2 task retrieval)
  // ════════════════════════════════════════════════════════════════════════════
  section('PART 2 — Read Path');

  const feature2Task =
    'Feature 2 task: implement parts reservation service. ' +
    'Check net available stock formula. Active reservations reduce inventory. ' +
    'Partial stock policy is unresolved. Respect travel buffer and technician scheduling.';

  const f2Result = await retrieve(feature2Task, {
    namespace: 'serviceforge:day4-memory-architecture:dev',
    budgets:   { bootstrap: 150, taskTime: 250, onDemand: 100, total: 500 },
  });

  // 2a: At least one memory returned
  check('2a. Retrieval returns at least one memory', f2Result.selected.length > 0,
        `selected=${f2Result.selected.length} fetched=${f2Result.total_rows_fetched}`);

  // 2b–2c: Stage attribution
  const hasBootstrap = f2Result.selected.some(m => m.stage === 'bootstrap');
  const hasTaskTime  = f2Result.selected.some(m => m.stage === 'task-time');
  check('2b. Bootstrap stage is populated', hasBootstrap);
  check('2c. Task-time stage is populated', hasTaskTime);

  // 2d–2g: Per-stage and total token budgets
  const { bootstrap: bt, task_time: tt, on_demand: od, total: totalT } = f2Result.token_usage;
  check(`2d. Bootstrap ≤ 150 tokens`,   bt    <= 150, `actual=${bt}`);
  check(`2e. Task-time ≤ 250 tokens`,   tt    <= 250, `actual=${tt}`);
  check(`2f. On-demand ≤ 100 tokens`,   od    <= 100, `actual=${od}`);
  check(`2g. Total ≤ 500 tokens`,       totalT <= 500, `actual=${totalT}`);

  // 2h–2i: Namespace scope correctness
  check('2h. Namespace scope includes repo:serviceforge',
        f2Result.namespace_queried.includes('repo:serviceforge'));
  check('2i. Namespace scope restricted to serviceforge repo',
        f2Result.namespace_queried.every(ns =>
          ns === 'repo:serviceforge' || ns.startsWith('serviceforge')));

  // 2j: Namespace isolation  —  unrelated repo memory must NOT appear
  // Insert a semantic memory in a foreign repo namespace (direct SQL — bypasses
  // the write pipeline so the classifier cannot discard it, giving the strongest
  // possible isolation test).
  await pool.query(
    `INSERT INTO memories (namespace, type_tag, content, source_task, status, timestamp)
     VALUES ($1, 'semantic', $2, 'other-project-setup', 'active', NOW())`,
    [
      'other-project:main:dev',
      'ISOLATION TEST: This memory belongs to other-project and must never appear in serviceforge context.',
    ]
  );
  const isoResult = await retrieve('parts reservation stock inventory technician', {
    namespace: 'serviceforge:day4-memory-architecture:dev',
  });
  const leaked = isoResult.selected.filter(m => m.namespace.startsWith('other-project'));
  check('2j. Namespace isolation: other-project memory excluded', leaked.length === 0,
        `leaked=${leaked.length}  scope=[${isoResult.namespace_queried.join(', ')}]`);

  // Also confirm the total rows fetched did NOT include the foreign row
  const foreignInFetch = (f2Result.total_rows_fetched - isoResult.total_rows_fetched);
  // isoResult was run after inserting the foreign row, so total_rows_fetched should NOT include it
  check('2k. Foreign row not fetched by namespace SQL filter',
        isoResult.total_rows_fetched === f2Result.total_rows_fetched,
        `before=${f2Result.total_rows_fetched} after=${isoResult.total_rows_fetched}`);

  // 2l–2m: Context injection
  const ctxStr = formatContext(f2Result);
  check('2l. Context injection: non-empty string produced', ctxStr.length > 0);
  check('2m. Context injection header present',             ctxStr.includes('Injected Memory Context'));

  // Print the full injected context for the audit report
  section('INJECTED CONTEXT — Feature 2 Task');
  console.log(ctxStr);

  // ════════════════════════════════════════════════════════════════════════════
  // Print per-memory detail for audit report
  // ════════════════════════════════════════════════════════════════════════════
  section('RETRIEVAL DETAIL — Feature 2 Task');
  console.log(`  Query: "${feature2Task.slice(0, 80)}..."`);
  console.log(`  Rows fetched from DB : ${f2Result.total_rows_fetched}`);
  console.log(`  Memories selected    : ${f2Result.selected.length}`);
  console.log(`  Memories excluded    : ${f2Result.excluded_count}`);
  console.log('');
  for (const m of f2Result.selected) {
    const rel = m.relevance.toFixed(3);
    console.log(`  [${m.stage.padEnd(10)}] id=${String(m.id).padStart(2)} rel=${rel} tokens=${m.tokens} ns=${m.namespace}`);
    console.log(`               type=${m.type_tag}  source=${m.source_task}`);
    console.log(`               "${m.content.slice(0, 90).replace(/\n/g,' ')}…"`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  section('SUMMARY');
  const passed = evidence.filter(e => e.status === 'PASS').length;
  const failed = evidence.filter(e => e.status === 'FAIL').length;

  for (const e of evidence) {
    console.log(`  ${e.status === 'PASS' ? '✓' : '✗'} ${e.label}${e.detail ? '  [' + e.detail + ']' : ''}`);
  }

  console.log('');
  console.log(`  ── Token Budget (Feature 2 task retrieval) ──`);
  console.log(`     Bootstrap : ${bt}  / 150  tokens`);
  console.log(`     Task-time : ${tt}  / 250  tokens`);
  console.log(`     On-demand : ${od}  / 100  tokens`);
  console.log(`     Total     : ${totalT} / 500  tokens`);

  console.log('');
  console.log(`  ${passed + failed} checks run  |  ${passed} passed  |  ${failed} failed`);
  console.log('='.repeat(70));

  await pool.end();
  if (failed > 0) process.exit(1);

})().catch(err => {
  console.error('\nFatal error:', err.message, err.stack);
  process.exit(1);
});
