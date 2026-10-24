import { env } from '../../src/config.mts';
import { database } from '../../src/database.mts';

export default async (request: Request) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const token = env('MCP_AUTH_TOKEN');
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
  const required = ['DATABASE_URL', 'OAUTH_STATE_SECRET', 'KOMMO_BASE_URL', 'KOMMO_REDIRECT_URI', 'KOMMO_ACCOUNT_ID', 'KOMMO_CLIENT_ID', 'KOMMO_CLIENT_SECRET'];
  const missing = required.filter(key => !env(key));
  try {
    const { pool } = database();
    const result = await pool.query({ text: "SELECT count(*)::int AS tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='elear_private' AND c.relname IN ('oauth_states','oauth_tokens') AND c.relkind='r' AND c.relrowsecurity" });
    const schemaReady = result.rows[0]?.tables === 2;
    return Response.json({ databaseConnected: true, schemaReady, missing, ready: schemaReady && missing.length === 0 }, { status: schemaReady && missing.length === 0 ? 200 : 503, headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const reason = ['28P01', '28000'].includes(code) ? 'database_authentication_failed' : ['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED'].includes(code) ? 'database_tls_verification_failed' : 'database_connection_failed';
    return Response.json({ databaseConnected: false, ready: false, missing, reason }, { status: 503, headers });
  }
};
