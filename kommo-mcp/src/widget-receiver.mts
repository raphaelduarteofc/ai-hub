import { createHash } from 'node:crypto';
import { jwtVerify } from 'jose';
import { requiredEnv } from './config.mts';
import { database } from './database.mts';

type WidgetEvent = { event_id: string; conversation_id: string; payload: unknown; return_url: string };

export function decodeKommoWidgetBody(body: string): unknown {
  if (body.trimStart().startsWith('{')) return JSON.parse(body);
  const form = new URLSearchParams(body);
  if (!form.has('token') || !form.has('return_url')) throw new Error('Invalid widget request');
  const data: Record<string, unknown> = {};
  for (const [key, value] of form) {
    const match = /^data\[([^\[\]]+)\]$/.exec(key);
    if (match) Object.defineProperty(data, match[1], { value, enumerable: true });
  }
  return {
    token: form.get('token'),
    return_url: form.get('return_url'),
    data: form.has('data') ? JSON.parse(form.get('data')!) : data,
  };
}

export function parseWidgetEvent(value: unknown): WidgetEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid widget event');
  const event = value as Partial<WidgetEvent>;
  if (typeof event.event_id !== 'string' || !event.event_id || event.event_id.length > 200) throw new Error('Invalid event_id');
  if (typeof event.conversation_id !== 'string' || !event.conversation_id || event.conversation_id.length > 200) throw new Error('Invalid conversation_id');
  if (typeof event.return_url !== 'string' || !event.return_url) throw new Error('Invalid return_url');
  return { event_id: event.event_id, conversation_id: event.conversation_id, payload: event.payload ?? {}, return_url: event.return_url };
}

export async function parseKommoWidgetRequest(value: unknown): Promise<WidgetEvent> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid widget request');
  const request = value as { token?: unknown; data?: unknown; return_url?: unknown };
  if (typeof request.token !== 'string' || typeof request.return_url !== 'string') throw new Error('Invalid widget request');
  const secret = new TextEncoder().encode(requiredEnv('KOMMO_CLIENT_SECRET'));
  const { payload } = await jwtVerify(request.token, secret, { algorithms: ['HS256', 'HS384', 'HS512'] });
  const account = requiredEnv('KOMMO_ACCOUNT_ID');
  if (String(payload.account_id) !== account) throw new Error('Widget account mismatch');
  if (typeof payload.entity_id !== 'string' && typeof payload.entity_id !== 'number') throw new Error('Invalid widget identity');
  if (typeof payload.entity_type !== 'string') throw new Error('Invalid widget identity');
  const identity = `${payload.entity_type}:${payload.entity_id}`;
  const returnUrl = new URL(request.return_url);
  const baseUrl = new URL(requiredEnv('KOMMO_BASE_URL'));
  if (returnUrl.protocol !== 'https:' || returnUrl.origin !== baseUrl.origin || !returnUrl.pathname.includes('/api/v4/')) {
    throw new Error('Invalid return_url');
  }
  // Authentication tokens can be reused across multiple turns. Including the
  // callback and data prevents different replies with the same JWT colliding.
  const data = request.data ?? {};
  const eventId = `kommo:${createHash('sha256')
    .update(request.token).update('\0').update(returnUrl.toString())
    .update('\0').update(JSON.stringify(data)).digest('hex')}`;
  return { event_id: eventId, conversation_id: identity, payload: data, return_url: returnUrl.toString() };
}

export async function enqueueWidgetEvent(event: WidgetEvent) {
  const result = await database().pool.query(
    `WITH inserted_event AS (
       INSERT INTO elear_private.widget_events(event_id, conversation_id, payload, return_url)
       VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id
     )
     INSERT INTO elear_private.agent_jobs(event_id, conversation_id, payload, return_url)
     SELECT event_id, $2, $3, $4 FROM inserted_event
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [event.event_id, event.conversation_id, JSON.stringify(event.payload), event.return_url],
  );
  return { accepted: true, duplicate: result.rows.length === 0 };
}
