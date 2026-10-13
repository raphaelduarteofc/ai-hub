import { callTool, tools } from '../../src/mcp.mts';
import { env } from '../../src/config.mts';

function authorized(request: Request): boolean {
  const expected = env('MCP_AUTH_TOKEN');
  return Boolean(expected) && request.headers.get('authorization') === `Bearer ${expected}`;
}

export default async (request: Request, context: { requestId?: string }) => {
  if (!env('MCP_AUTH_TOKEN')) return Response.json({ error: 'MCP_AUTH_TOKEN is not configured' }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (request.method !== 'POST') return Response.json({ error: 'MCP endpoint accepts POST only' }, { status: 405, headers: { Allow: 'POST' } });
  const id = context.requestId ?? crypto.randomUUID();
  let message: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> } = {};
  try {
    message = await request.json() as typeof message;
    let result: unknown;
    if (message.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'kommo-dot-mcp', version: '0.1.0' } };
    else if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    else if (message.method === 'tools/list') result = { tools };
    else if (message.method === 'tools/call') result = await callTool(String(message.params?.name), (message.params?.arguments ?? {}) as Record<string, unknown>);
    else throw new Error(`Unsupported MCP method: ${message.method}`);
    console.log(JSON.stringify({ event: 'mcp_request', requestId: id, method: message.method, ok: true }));
    return Response.json({ jsonrpc: '2.0', id: message.id ?? null, result });
  } catch (error) {
    console.error(JSON.stringify({ event: 'mcp_request', requestId: id, ok: false, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : 'Request failed' } }, { status: 400 });
  }
};
