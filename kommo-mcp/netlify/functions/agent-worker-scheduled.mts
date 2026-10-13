import { env } from '../../src/config.mts';
import { runWorker } from './agent-worker.mts';

export const config = { schedule: '* * * * *' };

export default async () => {
    const token = env('ELEAR_AGENT_WORKER_TOKEN');
  if (!token) return new Response(JSON.stringify({ error: 'Worker is not configured' }), { status: 503 });
  return runWorker(new Request('https://internal.invalid/agent-worker', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  }));
};
