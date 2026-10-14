import { createHash, createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { requiredEnv } from './config.mts';
export const COOKIE_NAME = '__Host-elear-oauth';
export const STATE_TTL_SECONDS = 600;
export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
function secret() { const v=requiredEnv('OAUTH_STATE_SECRET'); if(v.length<32) throw new Error('OAuth secret too short'); return v; }
function sign(payload:string) { return createHmac('sha256',secret()).update(payload).digest('base64url'); }
export function newState(now=Date.now()) {
  const session=randomBytes(32).toString('base64url'), expiresAt=now+STATE_TTL_SECONDS*1000;
  const payload=Buffer.from(JSON.stringify({nonce:randomBytes(32).toString('base64url'),expires:expiresAt,session:digest(session)})).toString('base64url');
  return {state:`${payload}.${sign(payload)}`,session,expiresAt};
}
export function validState(state:string,session:string,now=Date.now()) {
  try {
    const parts=state.split('.'); if(parts.length!==2 || !session) return false;
    const a=Buffer.from(sign(parts[0])),b=Buffer.from(parts[1]);
    if(a.length!==b.length || !timingSafeEqual(a,b)) return false;
    const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());
    return typeof p.nonce==='string' && typeof p.expires==='number' && p.expires>now && p.expires<=now+STATE_TTL_SECONDS*1000 && p.session===digest(session);
  } catch { return false; }
}
export function sessionCookie(request:Request) {
  const values=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(`${COOKIE_NAME}=`));
  return values.length===1?values[0].slice(COOKIE_NAME.length+1):'';
}
export function cookie(value:string,maxAge=STATE_TTL_SECONDS) { return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
export function redirectUri() {
  const url=new URL(requiredEnv('KOMMO_REDIRECT_URI'));
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.pathname!=='/oauth/callback') throw new Error('Invalid OAuth redirect URI');
  return url.href;
}
function key() { return createHash('sha256').update('elear-token-vault-v1\0').update(secret()).digest(); }
export function seal(value:unknown) {
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);
  const data=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);
  return [iv,c.getAuthTag(),data].map(v=>v.toString('base64url')).join('.');
}
export function unseal(value:string):unknown {
  const parts=value.split('.'); if(parts.length!==3) throw new Error('Invalid encrypted authorization');
  const [iv,tag,data]=parts.map(v=>Buffer.from(v,'base64url')),c=createDecipheriv('aes-256-gcm',key(),iv);c.setAuthTag(tag);
  return JSON.parse(Buffer.concat([c.update(data),c.final()]).toString('utf8'));
}
