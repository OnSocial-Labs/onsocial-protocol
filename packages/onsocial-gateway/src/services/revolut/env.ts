export type RevolutEnvironment = 'sandbox' | 'production';

export type EnvReader = (name: string, fallback?: string) => string;

const DEFAULT_API_URLS: Record<RevolutEnvironment, string> = {
  sandbox: 'https://sandbox-merchant.revolut.com/api',
  production: 'https://merchant.revolut.com/api',
};

function readProcessEnv(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

function normalizeRevolutEnvironment(
  value?: string
): RevolutEnvironment | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['sandbox', 'test', 'testing'].includes(normalized)) return 'sandbox';
  if (['production', 'prod', 'live'].includes(normalized)) {
    return 'production';
  }
  return undefined;
}

function inferEnvironmentFromApiUrl(
  apiUrl?: string
): RevolutEnvironment | undefined {
  if (!apiUrl) return undefined;
  if (apiUrl.includes('sandbox-merchant.revolut.com')) return 'sandbox';
  if (apiUrl.includes('merchant.revolut.com')) return 'production';
  return undefined;
}

export function resolveRevolutEnvironment(
  readEnv: EnvReader = readProcessEnv
): RevolutEnvironment {
  return (
    normalizeRevolutEnvironment(readEnv('REVOLUT_ENVIRONMENT')) ||
    normalizeRevolutEnvironment(readEnv('REVOLUT_MODE')) ||
    inferEnvironmentFromApiUrl(readEnv('REVOLUT_API_URL')) ||
    'sandbox'
  );
}

export function resolveRevolutScopedEnvName(
  baseName: string,
  environment: RevolutEnvironment
): string {
  return `${baseName}_${environment === 'production' ? 'PRODUCTION' : 'SANDBOX'}`;
}

export function resolveRevolutEnvValue(
  baseName: string,
  readEnv: EnvReader = readProcessEnv,
  fallback = ''
): string {
  const environment = resolveRevolutEnvironment(readEnv);
  return (
    readEnv(resolveRevolutScopedEnvName(baseName, environment)) ||
    readEnv(baseName) ||
    fallback
  );
}

export function resolveRevolutVariationEnvName(
  tier: string,
  environment?: RevolutEnvironment
): string {
  const resolvedEnvironment = environment || resolveRevolutEnvironment();
  return resolveRevolutScopedEnvName(
    `REVOLUT_${tier.toUpperCase()}_VARIATION_ID`,
    resolvedEnvironment
  );
}

export function resolveRevolutVariationId(
  tier: string,
  readEnv: EnvReader = readProcessEnv
): string {
  return resolveRevolutEnvValue(
    `REVOLUT_${tier.toUpperCase()}_VARIATION_ID`,
    readEnv
  );
}

export interface ResolvedRevolutConfig {
  environment: RevolutEnvironment;
  secretKey: string;
  publicKey: string;
  webhookSigningSecret: string;
  apiUrl: string;
  apiVersion: string;
}

export function resolveRevolutConfig(
  readEnv: EnvReader = readProcessEnv
): ResolvedRevolutConfig {
  const environment = resolveRevolutEnvironment(readEnv);
  return {
    environment,
    secretKey: resolveRevolutEnvValue('REVOLUT_SECRET_KEY', readEnv),
    publicKey: resolveRevolutEnvValue('REVOLUT_PUBLIC_KEY', readEnv),
    webhookSigningSecret: resolveRevolutEnvValue(
      'REVOLUT_WEBHOOK_SIGNING_SECRET',
      readEnv
    ),
    apiUrl: resolveRevolutEnvValue(
      'REVOLUT_API_URL',
      readEnv,
      DEFAULT_API_URLS[environment]
    ),
    apiVersion: resolveRevolutEnvValue(
      'REVOLUT_API_VERSION',
      readEnv,
      '2025-12-04'
    ),
  };
}
