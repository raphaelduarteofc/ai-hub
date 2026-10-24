export function readStoredToken(raw: string | null): string {
  if (!raw) throw new Error('Kommo authorization is missing');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid stored Kommo authorization'); }
  if (!value || typeof value !== 'object' || !('access_token' in value) ||
      typeof value.access_token !== 'string' || !value.access_token.trim()) {
    throw new Error('Invalid stored Kommo authorization');
  }
  if ('expires_at' in value && typeof value.expires_at === 'number' && value.expires_at <= Date.now()) {
    throw new Error('Kommo authorization expired; renew authorization');
  }
  return value.access_token;
}
