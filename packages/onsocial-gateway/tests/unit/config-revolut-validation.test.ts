import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@onsocial/rpc', () => ({
  resolveNearRpcUrl: vi.fn(() => 'https://rpc.testnet.near.org'),
}));

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

const originalEnv = { ...process.env };

async function loadConfigModule() {
  vi.resetModules();
  return import('../../src/config/index.js');
}

describe('validateRevolutBillingConfig', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long!!';
    process.env.HASURA_ADMIN_SECRET = 'hasura-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts production-scoped Revolut configuration', async () => {
    process.env.REVOLUT_ENVIRONMENT = 'production';
    process.env.REVOLUT_SECRET_KEY_PRODUCTION = 'sk_live_prod';
    process.env.REVOLUT_PUBLIC_KEY_PRODUCTION = 'pk_live_prod';
    process.env.REVOLUT_WEBHOOK_SIGNING_SECRET_PRODUCTION = 'wsk_prod';
    process.env.REVOLUT_PRO_VARIATION_ID_PRODUCTION = 'pro-var-prod';
    process.env.REVOLUT_SCALE_VARIATION_ID_PRODUCTION = 'scale-var-prod';

    const { validateRevolutBillingConfig } = await loadConfigModule();

    expect(validateRevolutBillingConfig()).toEqual({
      enabled: true,
      environment: 'production',
      warnings: [],
    });
  });

  it('warns when production omits REVOLUT_ENVIRONMENT and would default to sandbox', async () => {
    const { validateRevolutBillingConfig } = await loadConfigModule();

    expect(validateRevolutBillingConfig()).toEqual({
      enabled: false,
      environment: 'sandbox',
      warnings: [
        'REVOLUT_ENVIRONMENT is not set; billing will default to sandbox.',
        'Revolut billing is configured to use sandbox in production.',
      ],
    });
  });

  it('throws when production billing is partially configured', async () => {
    process.env.REVOLUT_ENVIRONMENT = 'production';
    process.env.REVOLUT_SECRET_KEY_PRODUCTION = 'sk_live_prod';
    process.env.REVOLUT_PUBLIC_KEY_PRODUCTION = 'pk_live_prod';
    process.env.REVOLUT_PRO_VARIATION_ID_PRODUCTION = 'pro-var-prod';

    const { validateRevolutBillingConfig } = await loadConfigModule();

    expect(() => validateRevolutBillingConfig()).toThrow(
      /REVOLUT_WEBHOOK_SIGNING_SECRET_PRODUCTION, REVOLUT_SCALE_VARIATION_ID_PRODUCTION/
    );
  });

  it('accepts sandbox-scoped Revolut configuration without warnings', async () => {
    process.env.REVOLUT_ENVIRONMENT = 'sandbox';
    process.env.REVOLUT_SECRET_KEY_SANDBOX = 'sk_test_sandbox';
    process.env.REVOLUT_PUBLIC_KEY_SANDBOX = 'pk_test_sandbox';
    process.env.REVOLUT_WEBHOOK_SIGNING_SECRET_SANDBOX = 'wsk_sandbox';
    process.env.REVOLUT_PRO_VARIATION_ID_SANDBOX = 'pro-var-sandbox';
    process.env.REVOLUT_SCALE_VARIATION_ID_SANDBOX = 'scale-var-sandbox';

    const { validateRevolutBillingConfig } = await loadConfigModule();

    expect(validateRevolutBillingConfig()).toEqual({
      enabled: true,
      environment: 'sandbox',
      warnings: ['Revolut billing is configured to use sandbox in production.'],
    });
  });
});
