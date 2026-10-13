import test from 'node:test';
import assert from 'node:assert/strict';
import { NetlifyDB } from '@netlify/database-dev';
import pg from 'pg';
import { seal,digest } from '../src/oauth-security.mts';
import { currentToken } from '../src/oauth-vault.mts';

test('local database consumes state once and persists the refreshed token',async()=>{
  process.env.OAUTH_STATE_SECRET='synthetic-test-secret-at-least-32-characters';
  process.env.KOMMO_ACCOUNT_ID='123';process.env.KOMMO_CLIENT_ID='test-client';process.env.KOMMO_CLIENT_SECRET='test-secret';
  process.env.KOMMO_REDIRECT_URI='https://kommo-mcp.netlify.app/oauth/callback';
  const db=new NetlifyDB();let pool:pg.Pool|undefined;
  try {
    const connectionString=await db.start();await db.applyMigrations('database/migrations');pool=new pg.Pool({connectionString});
    await pool.query('INSERT INTO elear_private.oauth_states(state_hash,session_hash,expires_at) VALUES ($1,$2,now()+interval \'10 minutes\')',[digest('state'),digest('session')]);
    const consume=()=>pool!.query('DELETE FROM elear_private.oauth_states WHERE state_hash=$1 AND session_hash=$2 AND expires_at>now() RETURNING state_hash',[digest('state'),digest('session')]);
    const consumed=await Promise.all([consume(),consume()]);assert.equal(consumed.reduce((n,r)=>n+r.rows.length,0),1);
    const base='https://example.kommo.com';
    await pool.query('INSERT INTO elear_private.oauth_tokens(account_origin,account_id,encrypted_tokens,expires_at) VALUES ($1,$2,$3,now()-interval \'1 minute\')',[base,123,seal({access_token:'old',refresh_token:'old-refresh',expires_in:86400})]);
    let exchanges=0;
    const fetcher:typeof fetch=async()=>{exchanges++;return Response.json({access_token:'new',refresh_token:'new-refresh',expires_in:86400});};
    // Local NetlifyDB does not prove multi-instance row-lock behavior.
    const tokens=[await currentToken(base,pool,fetcher),await currentToken(base,pool,fetcher)];
    assert.deepEqual(tokens,['new','new']);assert.equal(exchanges,1);
    process.env.KOMMO_ACCOUNT_ID='999';await assert.rejects(currentToken(base,pool,fetcher),/account mismatch/);
  } finally {
    if(pool) await pool.end();
    try {
      await db.stop();
    } catch(error) {
      // NetlifyDB can close its local server during pool shutdown; cleanup
      // should not turn a passing database assertion into a failed test.
      if(!(error instanceof Error && 'code' in error && error.code === 'ERR_SERVER_NOT_RUNNING')) throw error;
    }
  }
});

