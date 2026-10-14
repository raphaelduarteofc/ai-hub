import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorker } from '../netlify/functions/agent-worker.mts';

test('public worker stays closed when the internal scheduled worker needs no token', async () => {
  delete process.env.ELEAR_AGENT_WORKER_TOKEN;
  assert.equal((await runWorker(new Request('https://example.com/worker', { method: 'POST' }))).status, 401);
  process.env.ELEAR_AGENT_WORKER_TOKEN = 'test-worker-token';
  assert.equal((await runWorker(new Request('https://example.com/worker', { method: 'POST', headers: { authorization: 'Bearer incorrect' } }))).status, 401);
  assert.equal((await runWorker(new Request('https://example.com/worker'))).status, 405);
});
