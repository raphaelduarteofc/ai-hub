type PoolLike = { connect(): Promise<{ query(text:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>, release():void }> };
import { database } from './database.mts';
import { requiredEnv } from './config.mts';
import { digest, seal, unseal, redirectUri } from './oauth-security.mts';
export type TokenPair={access_token:string;refresh_token:string;expires_in:number};
export function validateTokens(value:unknown):TokenPair {
  if(!value || typeof value!=='object') throw new Error('Invalid token response');
  const t=value as Partial<TokenPair>;
  if(typeof t.access_token!=='string'||!t.access_token.trim()||typeof t.refresh_token!=='string'||!t.refresh_token.trim()||typeof t.expires_in!=='number'||!Number.isFinite(t.expires_in)||t.expires_in<=0) throw new Error('Invalid token response');
  return {access_token:t.access_token,refresh_token:t.refresh_token,expires_in:t.expires_in};
}
export function expectedAccount() { const id=requiredEnv('KOMMO_ACCOUNT_ID');if(!/^[1-9][0-9]*$/.test(id)) throw new Error('Invalid expected account ID');return id; }
export async function exchange(base:string,grant:Record<string,string>,fetcher=fetch) {
  const r=await fetcher(`${base}/oauth2/access_token`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({client_id:requiredEnv('KOMMO_CLIENT_ID'),client_secret:requiredEnv('KOMMO_CLIENT_SECRET'),redirect_uri:redirectUri(),...grant})});
  if(!r.ok) throw new Error(`Kommo token exchange failed HTTP ${r.status}`);return validateTokens(await r.json());
}
export async function addState(state:string,session:string,expiresAt:number) {
  await database().sql`INSERT INTO elear_oauth_states(state_hash,session_hash,expires_at) VALUES (${digest(state)},${digest(session)},${new Date(expiresAt)})`;
}
export async function consumeState(state:string,session:string) {
  const rows=await database().sql`DELETE FROM elear_oauth_states WHERE state_hash=${digest(state)} AND session_hash=${digest(session)} AND expires_at>now() RETURNING state_hash`;
  return rows.length===1;
}
export async function saveTokens(base:string,tokens:TokenPair) {
  await database().sql`INSERT INTO elear_oauth_tokens(account_origin,account_id,encrypted_tokens,expires_at) VALUES (${base},${expectedAccount()},${seal(tokens)},${new Date(Date.now()+tokens.expires_in*1000)}) ON CONFLICT(account_origin) DO UPDATE SET account_id=EXCLUDED.account_id,encrypted_tokens=EXCLUDED.encrypted_tokens,expires_at=EXCLUDED.expires_at,updated_at=now()`;
}
export async function currentToken(base:string,pool:PoolLike=database().pool,fetcher=fetch) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout = '5s'");
    await c.query("SET LOCAL statement_timeout = '20s'");
    const r=await c.query('SELECT account_id,encrypted_tokens,expires_at FROM elear_oauth_tokens WHERE account_origin=$1 FOR UPDATE',[base]);
    if(r.rows.length!==1||String(r.rows[0].account_id)!==expectedAccount()) throw new Error('Kommo authorization missing or account mismatch');
    let t=validateTokens(unseal(String(r.rows[0].encrypted_tokens)));
    const expiration=new Date(String(r.rows[0].expires_at)).getTime();
    if(!Number.isFinite(expiration)) throw new Error('Invalid token expiration');
    if(expiration<=Date.now()+60000) {
      t=await exchange(base,{grant_type:'refresh_token',refresh_token:t.refresh_token},fetcher);
      await c.query('UPDATE elear_oauth_tokens SET encrypted_tokens=$1,expires_at=$2,updated_at=now() WHERE account_origin=$3',[seal(t),new Date(Date.now()+t.expires_in*1000),base]);
    }
    await c.query('COMMIT');return t.access_token;
  } catch(e) { await c.query('ROLLBACK');throw e; } finally {c.release();}
}
