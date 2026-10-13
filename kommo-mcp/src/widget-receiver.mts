import { createHmac, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './config.mts';
import { database } from './database.mts';

type WidgetEvent = { event_id: string; conversation_id: string; payload: unknown };

function signature(body: string) {
  return createHmac('sha256', requiredEnv('WIDGET_SIGNING_SECRET')).update(body).digest('hex');
}

export function verifyWidgetSignature(body: string, supplied: string | null) {
  if (!supplied) return false;
  const expected = Buffer.from(signature(body), 'utf8');
  const actual = Buffer.from(supplied.trim(), 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function parseWidgetEvent(value: unknown): WidgetEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid widget event');
  const event = value as Partial<WidgetEvent>;
  if (typeof event.event_id !== 'string' || !event.event_id || event.event_id.length > 200) throw new Error('Invalid event_id');
  if (typeof event.conversation_id !== 'string' || !event.conversation_id || event.conversation_id.length > 200) throw new Error('Invalid conversation_id');
  return { event_id: event.event_id, conversation_id: event.conversation_id, payload: event.payload ?? {} };
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
