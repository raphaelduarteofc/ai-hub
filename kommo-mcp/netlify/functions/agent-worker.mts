import { database } from '../../src/database.mts';
import { env, requiredEnv } from '../../src/config.mts';
import { decideSalesAgent, type SalesAgentState } from '../../src/sales-agent.mts';
import { currentToken } from '../../src/oauth-vault.mts';
import { ensureKommoHandoffTask } from '../../src/kommo-handoff.mts';

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

export async function processAgentJob(conversationId?: string) {
  const db = database().pool;
  if (!conversationId) {
    const candidate = await db.query(
      `SELECT conversation_id FROM elear_private.agent_jobs
        WHERE status = 'queued' AND available_at <= now() ORDER BY id LIMIT 1`,
    );
    conversationId = candidate.rows[0]?.conversation_id as string | undefined;
  }
  if (!conversationId) return Response.json({ processed: 0, reason: 'empty_queue' }, { status: 200, headers });

  let processed = 0;
  let failed = false;
  const deadline = Date.now() + 35000;
  while (processed < 10 && Date.now() < deadline) {
    const client = await db.connect();
    let job: { id: string; event_id: string; conversation_id: string; payload: unknown; return_url: string } | undefined;
    try {
      await client.query('BEGIN');
      // Transaction-scoped lock works with transaction-mode Supabase poolers.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [conversationId]);
      await client.query(
        `UPDATE elear_private.agent_jobs
            SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
                available_at = now(), updated_at = now()
          WHERE conversation_id = $1 AND status = 'processing' AND updated_at < now() - interval '2 minutes'`,
        [conversationId],
      );
      const result = await client.query(
        `SELECT id, event_id, conversation_id, payload, return_url
           FROM elear_private.agent_jobs
          WHERE status = 'queued' AND available_at <= now() AND conversation_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM elear_private.agent_jobs active
               WHERE active.conversation_id = $1 AND active.status = 'processing'
            )
          ORDER BY id LIMIT 1 FOR UPDATE`, [conversationId],
      );
      if (result.rows[0]) {
        job = result.rows[0] as NonNullable<typeof job>;
        await client.query(
          `UPDATE elear_private.agent_jobs
              SET status = 'processing', attempts = attempts + 1, updated_at = now()
            WHERE id = $1`, [job.id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    if (!job) break;

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
      if (decision.mode === 'handoff' && decision.reason !== 'user_requested_stop') {
        await ensureKommoHandoffTask(claimedJob.conversation_id, claimedJob.event_id, decision.state);
      }
      const accessToken = await currentToken(new URL(requiredEnv('KOMMO_BASE_URL')).origin);
      const callback = await fetch(claimedJob.return_url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ data: { message: decision.message, mode: decision.mode, reason: decision.reason } }),
      });
      if (!callback.ok) throw new Error(`Kommo callback HTTP ${callback.status}`);
      await db.query(
        `UPDATE elear_private.agent_jobs SET status = 'completed',
           payload = payload || $2::jsonb, updated_at = now() WHERE id = $1`,
        [claimedJob.id, JSON.stringify({ agent_context: decision.state, agent_decision: { mode: decision.mode, reason: decision.reason } })],
      );
      processed += 1;
    } catch (error) {
      failed = true;
      console.error('agent_job_failed', {
        job_id: claimedJob.id,
        reason: error instanceof Error && /^Kommo (callback|lead|task|task lookup|task create|task verification) HTTP \d+$/.test(error.message) ? error.message : 'processing_or_authorization_failed',
      });
      await db.query(
        `UPDATE elear_private.agent_jobs
            SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
                available_at = now() + interval '30 seconds', updated_at = now()
          WHERE id = $1`, [claimedJob.id],
      );
      break;
    }
  }
  return Response.json({ processed, failed }, { status: failed ? 502 : 200, headers });
}

export default runWorker;
