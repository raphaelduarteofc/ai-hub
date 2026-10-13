import { jwtVerify } from 'jose';
import { requiredEnv } from './config.mts';
import { database } from './database.mts';

type WidgetEvent = { event_id: string; conversation_id: string; payload: unknown };

export function parseWidgetEvent(value: unknown): WidgetEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid widget event');
  const event = value as Partial<WidgetEvent>;
  if (typeof event.event_id !== 'string' || !event.event_id || event.event_id.length > 200) throw new Error('Invalid event_id');
  if (typeof event.conversation_id !== 'string' || !event.conversation_id || event.conversation_id.length > 200) throw new Error('Invalid conversation_id');
  return { event_id: event.event_id, conversation_id: event.conversation_id, payload: event.payload ?? {} };
}

export async function parseKommoWidgetRequest(value: unknown): Promise<WidgetEvent> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid widget request');
  const request = value as { token?: unknown; data?: unknown; return_url?: unknown };
  if (typeof request.token !== 'string' || typeof request.return_url !== 'string') throw new Error('Invalid widget request');
  const secret = new TextEncoder().encode(requiredEnv('KOMMO_CLIENT_SECRET'));
  const { payload } = await jwtVerify(request.token, secret, { algorithms: ['HS256'] });
  const account = requiredEnv('KOMMO_ACCOUNT_ID');
  if (String(payload.account_id) !== account) throw new Error('Widget account mismatch');
  if (typeof payload.entity_id !== 'string' && typeof payload.entity_id !== 'number') throw new Error('Invalid widget identity');
  if (typeof payload.entity_type !== 'string') throw new Error('Invalid widget identity');
  const identity = `${payload.entity_type}:${payload.entity_id}`;
  return { event_id: `${identity}:${payload.client_uid ?? 'unknown'}`, conversation_id: identity, payload: request.data ?? {} };
}

export async function enqueueWidgetEvent(event: WidgetEvent) {
  const result = await database().pool.query(
    `WITH inserted_event AS (
       INSERT INTO elear_private.widget_events(event_id, conversation_id, payload)
       VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id
     )
     INSERT INTO elear_private.agent_jobs(event_id, conversation_id, payload)
     SELECT event_id, $2, $3 FROM inserted_event
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [event.event_id, event.conversation_id, JSON.stringify(event.payload)],
  );
  return { accepted: true, duplicate: result.rows.length === 0 };
}
