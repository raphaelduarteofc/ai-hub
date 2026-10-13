import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { parseKommoWidgetRequest } from '../src/widget-receiver.mts';

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
});

test('rejects a widget JWT for another account', async () => {
  process.env.KOMMO_CLIENT_SECRET = 'widget-secret';
  process.env.KOMMO_ACCOUNT_ID = '34040199';
  process.env.KOMMO_BASE_URL = `https://${['elearhome', 'kommo.com'].join('.')}`;
  const token = await new SignJWT({ account_id: 1, entity_type: 'lead', entity_id: 77 })
    .setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('widget-secret'));
  await assert.rejects(parseKommoWidgetRequest({ token, data: {}, return_url: 'https://example.com' }), /Widget account mismatch/);
});
