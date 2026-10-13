import pg from 'pg';
import { supabaseCA } from './supabase-ca.mts';
import { requiredEnv, env } from './config.mts';
let pool: pg.Pool | undefined;
export function database() {
  if (!pool) {
    const url = new URL(requiredEnv('DATABASE_URL'));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !(url.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname))) {
      throw new Error('Invalid configured database host');
    }
    // Keep certificate verification under application control; connection URL
    // SSL options must not silently disable verification.
    for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
    pool = new pg.Pool({ connectionString: url.href, max: 2, connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000, statement_timeout: 15000, ssl: { rejectUnauthorized: true, ca: env('DATABASE_CA_CERT') || supabaseCA } });
    pool.on('error', () => console.error('database_idle_connection_error'));
  }
  return { pool };
}
