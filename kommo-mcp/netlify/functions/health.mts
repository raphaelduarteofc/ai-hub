export default async () => Response.json({ ok: true, service: 'kommo-dot-mcp', mode: 'read-only', time: new Date().toISOString() });
