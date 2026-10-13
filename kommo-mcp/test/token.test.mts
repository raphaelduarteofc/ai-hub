import test from 'node:test';
import assert from 'node:assert/strict';
import { readStoredToken } from '../src/token.mts';
import { kommoWrite } from '../src/kommo.mts';

test('Bearer contains access token only, never the stored JSON or refresh token', () => {
  assert.equal(readStoredToken(JSON.stringify({access_token: 'test-access', refresh_token: 'test-refresh'})), 'test-access');
});
test('missing, malformed and expired authorization fails closed', () => {
  for (const raw of [null, 'invalid', '{}', JSON.stringify({access_token: 'test', expires_at: 1})]) {
    assert.throws(() => readStoredToken(raw));
  }
});
test('writes stay disabled without explicit runtime enablement', async () => {
  delete process.env.KOMMO_WRITES_ENABLED;
  await assert.rejects(kommoWrite('leads', 'POST', [], 'test-key-123'), /writes are disabled/);
});
