import { currentToken } from './oauth-vault.mts';
import { requiredEnv } from './config.mts';
import type { SalesAgentState } from './sales-agent.mts';

function apiUrl(path: string) {
  const base = new URL(requiredEnv('KOMMO_BASE_URL'));
  return new URL(path, base.origin);
}

async function kommoFetch(url: URL, token: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/hal+json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

/** Create one follow-up task for the lead's existing owner; the event marker makes retries idempotent. */
export async function ensureKommoHandoffTask(conversationId: string, eventId: string, state: SalesAgentState) {
  const [entityType, entityId] = conversationId.split(':');
  if (entityType !== '2' || !/^\d+$/.test(entityId ?? '')) throw new Error('Unsupported handoff entity');
  const token = await currentToken(new URL(requiredEnv('KOMMO_BASE_URL')).origin);
  const leadResponse = await kommoFetch(apiUrl(`/api/v4/leads/${entityId}`), token);
  if (!leadResponse.ok) throw new Error(`Kommo lead HTTP ${leadResponse.status}`);
  const lead = await leadResponse.json() as { responsible_user_id?: unknown };
  if (!Number.isSafeInteger(lead.responsible_user_id) || Number(lead.responsible_user_id) <= 0) throw new Error('Lead has no valid owner');

  const marker = eventId.replace(/[^a-zA-Z0-9]/g, '').slice(-24);
  if (!marker) throw new Error('Handoff event has no stable marker');
  const taskSearchUrl = apiUrl('/api/v4/tasks');
  taskSearchUrl.searchParams.set('filter[entity_type]', 'leads');
  taskSearchUrl.searchParams.set('filter[entity_id][]', entityId);
  taskSearchUrl.searchParams.set('limit', '250');
  taskSearchUrl.searchParams.set('order[created_at]', 'desc');
  const existingResponse = await kommoFetch(taskSearchUrl, token);
  if (!existingResponse.ok) throw new Error(`Kommo task lookup HTTP ${existingResponse.status}`);
  const existing = await existingResponse.json() as { _embedded?: { tasks?: Array<{ text?: string }> } };
  if (existing._embedded?.tasks?.some(task => task.text?.includes(`[ELEAR-SB:${marker}]`))) return { created: false };

  const details = [
    `Operação: ${state.operation ?? 'não identificada'}`,
    `Ambiente: ${state.environment ?? 'não informado'}`,
    `Cidade: ${state.city ?? 'não informada'}`,
    `Área: ${state.area ?? 'não informada'}`,
    `Previsão: ${state.timing ?? 'não informada'}`,
  ].join('\n');
  const response = await kommoFetch(apiUrl('/api/v4/tasks'), token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      task_type_id: 1,
      text: `Atender conversa de WhatsApp da ELEAR Sales Brain\n${details}\nReferência: [ELEAR-SB:${marker}]`,
      complete_till: Math.floor(Date.now() / 1000),
      entity_id: Number(entityId),
      entity_type: 'leads',
      responsible_user_id: Number(lead.responsible_user_id),
      request_id: marker,
    }]),
  });
  if (!response.ok) throw new Error(`Kommo task create HTTP ${response.status}`);
  const created = await response.json() as { _embedded?: { tasks?: Array<{ id?: number; text?: string }> } };
  if (!created._embedded?.tasks?.some(task => Number.isSafeInteger(task.id) && task.text?.includes(`[ELEAR-SB:${marker}]`))) {
    const verification = await kommoFetch(taskSearchUrl, token);
    if (!verification.ok) throw new Error(`Kommo task verification HTTP ${verification.status}`);
    const verified = await verification.json() as { _embedded?: { tasks?: Array<{ text?: string }> } };
    if (!verified._embedded?.tasks?.some(task => task.text?.includes(`[ELEAR-SB:${marker}]`))) throw new Error('Kommo handoff task not confirmed');
  }
  return { created: true };
}
