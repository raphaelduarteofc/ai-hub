declare global {
  var Netlify: { env: { get(name: string): string | undefined } } | undefined;
}

export function env(name: string): string | undefined {
  return globalThis.Netlify?.env?.get(name) ?? process.env[name]
}

export function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
