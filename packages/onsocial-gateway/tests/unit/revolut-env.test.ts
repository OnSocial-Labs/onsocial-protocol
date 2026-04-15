import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveRevolutConfig,
  resolveRevolutEnvironment,
  resolveRevolutVariationEnvName,
  resolveRevolutVariationId,
} from '../../src/services/revolut/env.js';

const originalEnv = { ...process.env };

describe('Revolut environment resolution', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to sandbox when no explicit environment is set', () => {
    delete process.env.REVOLUT_ENVIRONMENT;
    delete process.env.REVOLUT_MODE;
    delete process.env.REVOLUT_API_URL;

    expect(resolveRevolutEnvironment()).toBe('sandbox');
  });

  it('prefers sandbox-scoped credentials and plan IDs when sandbox mode is selected', () => {
    process.env.REVOLUT_ENVIRONMENT = 'sandbox';
    process.env.REVOLUT_SECRET_KEY_SANDBOX = 'sandbox-secret';
    process.env.REVOLUT_SECRET_KEY = 'generic-secret';
    process.env.REVOLUT_PRO_VARIATION_ID_SANDBOX = 'pro-sandbox';
    process.env.REVOLUT_PRO_VARIATION_ID = 'pro-generic';

    const config = resolveRevolutConfig();

    expect(config.environment).toBe('sandbox');
    expect(config.secretKey).toBe('sandbox-secret');
    expect(config.apiUrl).toBe('https://sandbox-merchant.revolut.com/api');
    expect(resolveRevolutVariationId('pro')).toBe('pro-sandbox');
  });

  it('prefers production-scoped credentials and plan IDs when production mode is selected', () => {
    process.env.REVOLUT_ENVIRONMENT = 'production';
    process.env.REVOLUT_SECRET_KEY_PRODUCTION = 'production-secret';
    process.env.REVOLUT_SCALE_VARIATION_ID_PRODUCTION = 'scale-production';

    const config = resolveRevolutConfig();

    expect(config.environment).toBe('production');
    expect(config.secretKey).toBe('production-secret');
    expect(config.apiUrl).toBe('https://merchant.revolut.com/api');
    expect(resolveRevolutVariationId('scale')).toBe('scale-production');
    expect(resolveRevolutVariationEnvName('scale', 'production')).toBe(
      'REVOLUT_SCALE_VARIATION_ID_PRODUCTION'
    );
  });

  it('falls back to the unsuffixed variables for backward compatibility', () => {
    process.env.REVOLUT_ENVIRONMENT = 'sandbox';
    process.env.REVOLUT_SECRET_KEY = 'generic-secret';
    process.env.REVOLUT_PUBLIC_KEY = 'generic-public';
    process.env.REVOLUT_WEBHOOK_SIGNING_SECRET = 'generic-webhook';
    process.env.REVOLUT_API_URL = 'https://sandbox-merchant.revolut.com/api';
    process.env.REVOLUT_PRO_VARIATION_ID = 'generic-pro';

    const config = resolveRevolutConfig();

    expect(config.secretKey).toBe('generic-secret');
    expect(config.publicKey).toBe('generic-public');
    expect(config.webhookSigningSecret).toBe('generic-webhook');
    expect(resolveRevolutVariationId('pro')).toBe('generic-pro');
  });
});
