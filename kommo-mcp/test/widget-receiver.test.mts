import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { decodeKommoWidgetBody, parseKommoWidgetRequest } from '../src/widget-receiver.mts';

test('decodes form-encoded Kommo webhooks without changing token or callback', () => {
  const body = new URLSearchParams({ token: 'signed.token', return_url: 'https://example.com/api/v4/salesbot/1/continue/2', 'data[message]': 'Olá + teste', 'data[source]': 'widget' }).toString();
  assert.deepEqual(decodeKommoWidgetBody(body), { token: 'signed.token', return_url: 'https://example.com/api/v4/salesbot/1/continue/2', data: { message: 'Olá + teste', source: 'widget' } });
});

test('decodes JSON webhooks and rejects malformed bodies', () => {
  const value = { token: 'signed.token', return_url: 'https://example.com/api/v4/test', data: { message: 'Olá' } };
  assert.deepEqual(decodeKommoWidgetBody(JSON.stringify(value)), value);
  assert.throws(() => decodeKommoWidgetBody('invalid'), /Invalid widget request/);
});

test('accepts Kommo widget JWT and derives a stable event id without storing the token', async () => {
  process.env.KOMMO_CLIENT_SECRET = 'widget-secret';
  process.env.KOMMO_ACCOUNT_ID = '34040199';
  const kommoBase = `https://${['elearhome', 'kommo.com'].join('.')}`;
  process.env.KOMMO_BASE_URL = kommoBase;
  const token = await new SignJWT({ account_id: 34040199, entity_type: 'lead', entity_id: 77, client_uid: 'widget' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setJti('event-1').sign(new TextEncoder().encode('widget-secret'));
  const event = await parseKommoWidgetRequest({ token, data: { message: 'hello' }, return_url: `${kommoBase}/api/v4/salesbot/1/continue/2` });
  assert.equal(event.conversation_id, 'lead:77');
  assert.match(event.event_id, /^kommo:[a-f0-9]{64}$/);
  assert.deepEqual(event.payload, { message: 'hello' });
  const retry = await parseKommoWidgetRequest({ token, data: { message: 'hello' }, return_url: event.return_url });
  assert.equal(retry.event_id, event.event_id);
  const nextTurn = await parseKommoWidgetRequest({ token, data: { message: 'Sala e 3 quartos' }, return_url: event.return_url });
  assert.notEqual(nextTurn.event_id, event.event_id);
});

test('rejects a widget JWT for another account', async () => {
  process.env.KOMMO_CLIENT_SECRET = 'widget-secret';
  process.env.KOMMO_ACCOUNT_ID = '34040199';
  process.env.KOMMO_BASE_URL = `https://${['elearhome', 'kommo.com'].join('.')}`;
  const token = await new SignJWT({ account_id: 1, entity_type: 'lead', entity_id: 77 })
    .setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('widget-secret'));
  await assert.rejects(parseKommoWidgetRequest({ token, data: {}, return_url: 'https://example.com' }), /Widget account mismatch/);
});

test('verifies HMAC variants and still rejects the wrong signing secret', async () => {
  process.env.KOMMO_CLIENT_SECRET = 'widget-secret';
  process.env.KOMMO_ACCOUNT_ID = '34040199';
  const base = `https://${['elearhome', 'kommo.com'].join('.')}`;
  process.env.KOMMO_BASE_URL = base;
  for (const alg of ['HS384', 'HS512']) {
    const claims = { account_id: 34040199, entity_type: 'lead', entity_id: 77 };
    const valid = await new SignJWT(claims).setProtectedHeader({ alg }).sign(new TextEncoder().encode('widget-secret'));
    const invalid = await new SignJWT(claims).setProtectedHeader({ alg }).sign(new TextEncoder().encode('wrong-secret'));
    const request = { token: valid, return_url: `${base}/api/v4/salesbot/1/continue/2` };
    assert.equal((await parseKommoWidgetRequest(request)).conversation_id, 'lead:77');
    await assert.rejects(parseKommoWidgetRequest({ ...request, token: invalid }), /signature verification failed/);
  }
});
