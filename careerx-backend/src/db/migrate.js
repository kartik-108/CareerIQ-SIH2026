// Simple, dependency-light migration runner.
// Applies every .sql file in src/db/migrations, in filename order,
// using the raw Postgres connection string (SUPABASE_DB_CONNECTION_STRING).
//
// Note: uses the `pg` driver. Add it with `npm install pg` if not already present.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function run() {
  const connectionString = env.SUPABASE_DB_CONNECTION_STRING;
  if (!connectionString) {
    logger.error('SUPABASE_DB_CONNECTION_STRING is not set in .env');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    logger.info({ file }, 'Applying migration');
    try {
      await client.query(sql);
      logger.info({ file }, 'Migration applied successfully');
    } catch (err) {
      logger.error({ file, err: err.message }, 'Migration failed');
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  logger.info('All migrations applied.');
}

run();
