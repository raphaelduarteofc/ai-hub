import { database } from '../../src/database.mts';
import { env, requiredEnv } from '../../src/config.mts';
import { decideSalesAgent, type SalesAgentState } from '../../src/sales-agent.mts';
import { currentToken } from '../../src/oauth-vault.mts';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function authorized(request: Request): boolean {
  const expected = env('ELEAR_AGENT_WORKER_TOKEN');
  const supplied = request.headers.get('authorization');
  return Boolean(expected && supplied === `Bearer ${expected}`);
}

function messageFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const value = (payload as { message?: unknown }).message;
  return typeof value === 'string' ? value : '';
}

export async function runWorker(request: Request) {
  if (request.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  return processAgentJob();
}

export async function processAgentJob() {
  const db = database().pool;
  const client = await db.connect();
  let job: { id: string; event_id: string; conversation_id: string; payload: unknown; return_url: string } | undefined;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, event_id, conversation_id, payload, return_url
         FROM elear_private.agent_jobs
        WHERE status = 'queued' AND available_at <= now()
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    if (!result.rows[0]) {
      await client.query('COMMIT');
      return Response.json({ processed: false, reason: 'empty_queue' }, { status: 200, headers });
    }
    const claimed = result.rows[0] as NonNullable<typeof job>;
    job = claimed;
    await client.query(
      `UPDATE elear_private.agent_jobs
          SET status = 'processing', attempts = attempts + 1, updated_at = now()
        WHERE id = $1`,
      [claimed.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (!job) return Response.json({ processed: false, reason: 'empty_queue' }, { status: 200, headers });
  const claimedJob = job;

  try {
    const previous = await db.query(
      `SELECT payload->'agent_context' AS state FROM elear_private.agent_jobs
        WHERE conversation_id = $1 AND status = 'completed' AND id < $2
          AND updated_at > now() - interval '24 hours' AND payload ? 'agent_context'
        ORDER BY id DESC LIMIT 1`, [claimedJob.conversation_id, claimedJob.id],
    );
    const state = previous.rows[0]?.state as SalesAgentState | undefined;
    const decision = decideSalesAgent({ message: messageFromPayload(claimedJob.payload), state: state?.version === 1 ? state : undefined });
    const accessToken = await currentToken(new URL(requiredEnv('KOMMO_BASE_URL')).origin);
    const callback = await fetch(claimedJob.return_url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ data: { message: decision.message, mode: decision.mode, reason: decision.reason } }),
    });
    if (!callback.ok) throw new Error(`Kommo callback HTTP ${callback.status}`);
    await db.query(
      `UPDATE elear_private.agent_jobs SET status = 'completed',
         payload = payload || $2::jsonb, updated_at = now() WHERE id = $1`,
      [claimedJob.id, JSON.stringify({ agent_context: decision.state, agent_decision: { mode: decision.mode, reason: decision.reason } })],
    );
    return Response.json({ processed: true, event_id: claimedJob.event_id, mode: decision.mode }, { status: 200, headers });
  } catch (error) {
    console.error('agent_job_failed', {
      job_id: claimedJob.id,
      reason: error instanceof Error && /^Kommo callback HTTP \d+$/.test(error.message) ? error.message : 'processing_or_authorization_failed',
    });
    await db.query(
      `UPDATE elear_private.agent_jobs
          SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
              available_at = now() + interval '30 seconds', updated_at = now()
        WHERE id = $1`,
      [claimedJob.id],
    );
    return Response.json({ error: 'Agent job failed' }, { status: 502, headers });
  }
}

export default runWorker;
