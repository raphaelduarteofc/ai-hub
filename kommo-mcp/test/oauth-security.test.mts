import test from 'node:test';
import assert from 'node:assert/strict';
import { newState,validState,seal,unseal,cookie,sessionCookie,redirectUri } from '../src/oauth-security.mts';
import { validateTokens } from '../src/oauth-vault.mts';
process.env.OAUTH_STATE_SECRET='synthetic-test-secret-at-least-32-characters';
test('OAuth state rejects tampering, expiration and another browser session',()=>{
  const v=newState();assert.equal(validState(v.state,v.session),true);
  assert.equal(validState(v.state,v.session, v.expiresAt),false);
  assert.equal(validState(v.state,'different-session'),false);
  assert.equal(validState(v.state+'x',v.session),false);
  assert.equal(validState(v.state+'.extra',v.session),false);
});
test('vault ciphertext is authenticated and contains no plaintext tokens',()=>{
  const t={access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:86400};
  const encrypted=seal(t);assert.equal(encrypted.includes(t.access_token),false);
  assert.deepEqual(unseal(encrypted),t);assert.throws(()=>unseal(encrypted.slice(0,-4)+'AAAA'));
});
test('cookie is secure, private and bound to canonical callback',()=>{
  assert.match(cookie('test'),/HttpOnly; Secure; SameSite=Lax/);
  assert.equal(sessionCookie(new Request('https://example.com',{headers:{cookie:'__Host-elear-oauth=test'}})),'test');
  assert.equal(sessionCookie(new Request('https://example.com',{headers:{cookie:'__Host-elear-oauth=a; __Host-elear-oauth=b'}})),'');
  process.env.KOMMO_REDIRECT_URI='https://kommo-mcp.netlify.app/oauth/callback';assert.equal(redirectUri(),process.env.KOMMO_REDIRECT_URI);
  process.env.KOMMO_REDIRECT_URI='http://example.com/oauth/callback';assert.throws(()=>redirectUri());
});
test('token response validation rejects partial or invalid credentials',()=>{
  for(const t of [{access_token:'test'}, {access_token:'a',refresh_token:'b',expires_in:-1},null]) assert.throws(()=>validateTokens(t));
});
