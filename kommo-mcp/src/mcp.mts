import { kommoGet } from './kommo.mts';

export const tools = [
  { name: 'kommo_account_get', description: 'Read the Kommo account.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'kommo_users_list', description: 'List Kommo users.', inputSchema: { type: 'object', properties: { limit: { type: 'integer' }, page: { type: 'integer' } }, additionalProperties: false } },
  { name: 'kommo_pipelines_list', description: 'List pipelines and stages.', inputSchema: { type: 'object', properties: { limit: { type: 'integer' }, page: { type: 'integer' } }, additionalProperties: false } },
  { name: 'kommo_resource_list', description: 'Read a supported Kommo resource collection.', inputSchema: { type: 'object', properties: { resource: { type: 'string', enum: ['leads','contacts','companies','tasks','webhooks'] }, limit: { type: 'integer' }, page: { type: 'integer' } }, required: ['resource'], additionalProperties: false } }

];

export async function callTool(name: string, args: Record<string, unknown> = {}) {
  const resource = name === 'kommo_account_get' ? 'account' : name === 'kommo_users_list' ? 'users' : name === 'kommo_pipelines_list' ? 'pipelines' : String(args.resource ?? '');
  if (!tools.some((tool) => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object');
  const allowed = name === 'kommo_account_get' ? [] : name === 'kommo_resource_list' ? ['resource','limit','page'] : ['limit','page'];
  for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`Unsupported argument: ${key}`);
  for (const key of ['limit', 'page']) if (args[key] !== undefined) {
    const value = args[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || (key === 'limit' && value > 250)) {
      throw new Error(`Invalid ${key}`);
    }
  }
  const query = new URLSearchParams();
  for (const key of ['limit', 'page']) if (args[key] !== undefined) query.set(key, String(args[key]));
  return { content: [{ type: 'text', text: JSON.stringify(await kommoGet(resource, query)) }] };
}
