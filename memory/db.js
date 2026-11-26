'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PGHOST     || 'localhost',
  port:     parseInt(process.env.PGPORT || '5433'),
  database: process.env.PGDATABASE || 'serviceforge_memory',
  user:     process.env.PGUSER     || 'memory_user',
  password: process.env.PGPASSWORD || 'memory_pass',
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id          SERIAL        PRIMARY KEY,
        namespace   TEXT          NOT NULL,
        type_tag    TEXT          NOT NULL,
        content     TEXT          NOT NULL,
        source_task TEXT          NOT NULL,
        status      TEXT          NOT NULL DEFAULT 'active',
        timestamp   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        embedding   vector(1536)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS memories_namespace_idx ON memories (namespace)`
    );
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
