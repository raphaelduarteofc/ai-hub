import { enqueueWidgetEvent, parseWidgetEvent, verifyWidgetSignature } from '../../src/widget-receiver.mts';

export default async (request: Request) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
  if (!process.env.WIDGET_SIGNING_SECRET && !globalThis.Netlify?.env?.get('WIDGET_SIGNING_SECRET')) return Response.json({ error: 'Widget receiver not configured' }, { status: 503, headers });
  const body = await request.text();
  if (!verifyWidgetSignature(body, request.headers.get('x-elear-signature'))) return Response.json({ error: 'Invalid signature' }, { status: 401, headers });
  try {
    const result = await enqueueWidgetEvent(parseWidgetEvent(JSON.parse(body)));
    return Response.json(result, { status: 202, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error && /Invalid (widget event|event_id|conversation_id)/.test(error.message) ? error.message : 'Invalid widget request' }, { status: 400, headers });
  }
};
