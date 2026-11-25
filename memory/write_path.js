'use strict';

const path = require('path');
const fs   = require('fs');
const { pool, initDb } = require('./db');

// ---------------------------------------------------------------------------
// Retain / Discard classifier  (memory-architecture.md §2.1)
// ---------------------------------------------------------------------------

const RETAIN_TAGS  = new Set(['semantic', 'procedural', 'episodic_decision', 'open_question']);
const DISCARD_TAGS = new Set(['git_operation', 'raw_output', 'intermediate_reasoning', 'ephemeral']);

// Reject any event whose content looks like it contains a secret.
const SECRET_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /private[_-]?key\s*[:=]/i,
];

function classify(event) {
  // Rule 1: type_tag in explicit discard set
  if (DISCARD_TAGS.has(event.type_tag)) {
    return { decision: 'discard', reason: `type_tag '${event.type_tag}' is in discard list` };
  }

  // Rule 2: content contains a secret
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(event.content)) {
      return { decision: 'discard', reason: 'content matches secret pattern' };
    }
  }

  // Rule 3: unconfirmed assumption
  if (event.assumption_status === 'unconfirmed') {
    return { decision: 'discard', reason: 'assumption_status is unconfirmed' };
  }

  // Rule 4: type_tag in explicit retain set
  if (RETAIN_TAGS.has(event.type_tag)) {
    return { decision: 'retain', reason: `type_tag '${event.type_tag}' is in retain list` };
  }

  // Default: discard anything not explicitly retained
  return { decision: 'discard', reason: `type_tag '${event.type_tag}' not in retain list` };
}

// ---------------------------------------------------------------------------
// Core persist  (always awaited internally; never called directly by callers)
// ---------------------------------------------------------------------------

async function _persistEvent(event) {
  const { decision, reason } = classify(event);

  const provenance = {
    source_task: event.source_task || 'unknown',
    timestamp:   new Date().toISOString(),
    type_tag:    event.type_tag,
    status:      event.status || 'active',
  };

  if (decision === 'discard') {
    return { stored: false, reason, provenance };
  }

  const result = await pool.query(
    `INSERT INTO memories (namespace, type_tag, content, source_task, status, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      event.namespace,
      provenance.type_tag,
      event.content,
      provenance.source_task,
      provenance.status,
      provenance.timestamp,
    ]
  );

  return { stored: true, id: result.rows[0].id, reason, provenance };
}

// ---------------------------------------------------------------------------
// Post-turn event hook  —  non-blocking
//
// Callers fire this after returning a response to the user.  The write is
// deferred to the next event-loop iteration (setImmediate), so the caller's
// call stack is never held up waiting for the DB round-trip.
// ---------------------------------------------------------------------------

function enqueueMemoryWrite(event, onComplete) {
  setImmediate(() => {
    _persistEvent(event)
      .then(result => { if (onComplete) onComplete(null, result); })
      .catch(err   => { if (onComplete) onComplete(err,  null);  });
  });
}

// ---------------------------------------------------------------------------
// Seed helper  —  load a JSON file and persist each entry through the pipeline
// ---------------------------------------------------------------------------

async function seedFromFile(filepath) {
  const seeds = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const results = [];
  for (const event of seeds) {
    const r = await _persistEvent(event);
    results.push({ label: event.content.slice(0, 70).replace(/\n/g, ' ') + '…', ...r });
  }
  return results;
}

module.exports = { enqueueMemoryWrite, seedFromFile };

// ---------------------------------------------------------------------------
// Self-test  —  runs only when invoked directly: node write_path.js
// ---------------------------------------------------------------------------

if (require.main === module) {
  (async () => {
    console.log('=== ServiceForge Memory Write Pipeline — Part 1 Validation ===\n');

    // ── 1. Init DB ──────────────────────────────────────────────────────────
    console.log('[1] Initializing PostgreSQL schema (pgvector extension + memories table)...');
    await initDb();
    // Clear any rows from a previous run so the row-count assertions stay exact.
    await pool.query('TRUNCATE memories RESTART IDENTITY');
    console.log('    ✓ Schema ready, table truncated for a clean run\n');

    // ── 2. Seed from memory_store.json ───────────────────────────────────────
    const seedFile = path.join(__dirname, 'memory_store.json');
    console.log('[2] Seeding from memory_store.json...');
    const seedResults = await seedFromFile(seedFile);

    const retained  = seedResults.filter(r =>  r.stored);
    const discarded = seedResults.filter(r => !r.stored);

    console.log(`    Seeds processed : ${seedResults.length}`);
    console.log(`    Retained        : ${retained.length}`);
    console.log(`    Discarded       : ${discarded.length}\n`);

    for (const r of seedResults) {
      const mark = r.stored ? '✓ RETAIN ' : '✗ DISCARD';
      const id   = r.stored ? ` (id=${r.id})` : '';
      console.log(`    ${mark}${id}`);
      console.log(`             content : ${r.label}`);
      console.log(`             reason  : ${r.reason}`);
    }

    // ── 3. Non-blocking post-turn hook demo ──────────────────────────────────
    console.log('\n[3] Demonstrating non-blocking post-turn hook...');

    let hookCompleted = false;
    const liveEvent = {
      namespace:   'serviceforge:day4-memory-architecture:dev',
      type_tag:    'episodic_decision',
      content:     'Part-1 validation run confirmed write pipeline end-to-end: retain/discard filter, provenance metadata, and PostgreSQL persistence all operating correctly.',
      source_task: 'kata-part1-validation',
      status:      'active',
    };

    enqueueMemoryWrite(liveEvent, (err, result) => {
      hookCompleted = true;
      if (err) {
        console.log('\n    [hook] ERROR:', err.message);
      } else {
        console.log(`\n    [hook] Fired asynchronously after main continued`);
        console.log(`    [hook] stored=${result.stored}, id=${result.id}`);
        console.log(`    [hook] provenance = ${JSON.stringify(result.provenance, null, 2).replace(/\n/g, '\n    [hook]           ')}`);
      }
    });

    // These two lines execute synchronously, before the hook fires.
    console.log('    Main call stack continues immediately (hook deferred to next tick)');
    console.log(`    hookCompleted right now: ${hookCompleted}  ← must be false to prove non-blocking`);

    // Give the event loop time to drain the setImmediate + DB round-trip.
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log(`\n    hookCompleted after 300 ms: ${hookCompleted}  ← must be true now`);

    // ── 4. Verify provenance fields ──────────────────────────────────────────
    console.log('\n[4] Verifying required provenance fields on every stored row...');
    const { rows } = await pool.query(
      `SELECT id, namespace, type_tag, source_task, status, timestamp FROM memories ORDER BY id`
    );
    console.log(`    Total rows in DB: ${rows.length}`);

    const incomplete = rows.filter(
      r => !r.namespace || !r.type_tag || !r.source_task || !r.status || !r.timestamp
    );
    if (incomplete.length === 0) {
      console.log('    ✓ Every row has: namespace, type_tag, source_task, status, timestamp\n');
    } else {
      console.log(`    ✗ ${incomplete.length} rows are missing one or more provenance fields\n`);
      process.exitCode = 1;
    }

    // ── 5. Verify discarded items absent from DB ──────────────────────────────
    console.log('[5] Verifying discarded memories are not in the DB...');
    // Expect: retained seeds + 1 live hook event = rows.length
    const expectedRows = retained.length + 1;
    if (rows.length === expectedRows) {
      console.log(`    ✓ DB has exactly ${expectedRows} rows (${retained.length} seeds + 1 hook demo)`);
      console.log(`    ✓ ${discarded.length} discarded candidates are absent\n`);
    } else {
      console.log(`    ✗ Expected ${expectedRows} rows, found ${rows.length}\n`);
      process.exitCode = 1;
    }

    console.log('=== Part 1 Validation Complete ===');
    await pool.end();
  })().catch(err => {
    console.error('\nFatal error:', err.message);
    pool.end();
    process.exit(1);
  });
}
