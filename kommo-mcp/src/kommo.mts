import { env, requiredEnv } from './config.mts';
import { currentToken } from './oauth-vault.mts';

const readPaths: Record<string, string> = {
  account: 'account', users: 'users', pipelines: 'leads/pipelines',
  leads: 'leads', contacts: 'contacts', companies: 'companies', tasks: 'tasks',
  webhooks: 'webhooks'
};

export function readPath(resource: string): string {
  if (!Object.hasOwn(readPaths, resource)) throw new Error(`Unsupported read resource: ${resource}`);
  return readPaths[resource];
}

export function kommoBase(): string {
  const url = new URL(requiredEnv('KOMMO_BASE_URL'));
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.kommo\.com$/.test(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid Kommo account origin');
  }
  return url.origin;
}


export async function kommoGet(resource: string, query: URLSearchParams = new URLSearchParams(), tokenProvider = currentToken) {
  const path = readPath(resource);
  const base = kommoBase();
  const accessToken = await tokenProvider(base);
  if (!accessToken) throw new Error('Missing Kommo access token; configure OAuth or KOMMO_ACCESS_TOKEN');
  const url = `${base}/api/v4/${path}${query.size ? `?${query}` : ''}`;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/hal+json' } });
  const body = await response.text();
  if (!response.ok) throw new Error(`Kommo API returned HTTP ${response.status}`);
  return body ? JSON.parse(body) : null;
}

export async function kommoWrite(resource: string, method: 'POST' | 'PATCH', body: unknown, idempotencyKey: string) {
  throw new Error('Kommo writes are disabled pending validation');
}
