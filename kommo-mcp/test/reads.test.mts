import test from 'node:test';
import assert from 'node:assert/strict';
import { kommoGet, kommoBase, readPath, kommoWrite } from '../src/kommo.mts';
import { callTool } from '../src/mcp.mts';

test('pipelines use the official leads/pipelines endpoint', () => {
  assert.equal(readPath('pipelines'), 'leads/pipelines');
  for (const resource of ['notes','chats','../account','constructor']) assert.throws(() => readPath(resource));
});

test('reject invalid arguments before calling the CRM', async () => {
  for (const args of [{limit: 251},{limit: '2'},{page: 0},{page: 1.5},{url:'https://example.com'}]) {
    await assert.rejects(callTool('kommo_users_list', args));
  }
  await assert.rejects(callTool('kommo_account_get', {limit:1}));
  await assert.rejects(callTool('kommo_leads_create', {confirm:true}));
});

test('origin validation and request routing prevent token forwarding', async () => {
  const oldBase=process.env.KOMMO_BASE_URL, oldToken=process.env.KOMMO_ACCESS_TOKEN;
  const oldFetch=globalThis.fetch;
  try {
    for (const base of ['http://elearhome.kommo.com','https://example.com','https://user:pass@elearhome.kommo.com','https://example.kommo.com/path']) {
      process.env.KOMMO_BASE_URL=base; assert.throws(() => kommoBase());
    }
    process.env.KOMMO_BASE_URL='https://example.kommo.com';
    process.env.KOMMO_ACCESS_TOKEN='synthetic-test-token';
    globalThis.fetch=async (input, options) => {
      assert.equal(String(input),'https://example.kommo.com/api/v4/leads/pipelines');
      assert.equal(options?.redirect,'error');
      return Response.json({_embedded:{pipelines:[]}});
    };
    await kommoGet('pipelines', new URLSearchParams(), async () => 'synthetic-test-token');
    process.env.KOMMO_WRITES_ENABLED='true';
    await assert.rejects(kommoWrite('leads','POST',[],'test-operation'), /disabled/);
  } finally {
    globalThis.fetch=oldFetch;
    if(oldBase===undefined) delete process.env.KOMMO_BASE_URL; else process.env.KOMMO_BASE_URL=oldBase;
    if(oldToken===undefined) delete process.env.KOMMO_ACCESS_TOKEN; else process.env.KOMMO_ACCESS_TOKEN=oldToken;
    delete process.env.KOMMO_WRITES_ENABLED;
  }
});
