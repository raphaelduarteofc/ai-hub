import { enqueueWidgetEvent, parseKommoWidgetRequest } from '../../src/widget-receiver.mts';

export default async (request: Request) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
  const body = await request.text();
  try {
    const result = await enqueueWidgetEvent(await parseKommoWidgetRequest(JSON.parse(body)));
    return Response.json({ status: 'success', ...result }, { status: 200, headers });
  } catch (error) {
    const diagnostic = error instanceof Error ? error : new Error('Unknown error');
    const knownMessages = ['Invalid widget request', 'Invalid widget identity', 'Widget account mismatch', 'Invalid return_url'];
    console.error('widget_request_rejected', {
      kind: diagnostic.name,
      code: 'code' in diagnostic && typeof diagnostic.code === 'string' ? diagnostic.code : undefined,
      reason: knownMessages.includes(diagnostic.message) ? diagnostic.message : 'validation_or_storage_failed',
    });
    return Response.json({ error: error instanceof Error && /Widget account mismatch|Invalid widget (request|identity)/.test(error.message) ? error.message : 'Invalid widget request' }, { status: 401, headers });
  }
};
