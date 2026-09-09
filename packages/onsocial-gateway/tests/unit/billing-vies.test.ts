import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEuVatId } from '../../src/services/billing/vies.js';

describe('VIES VAT validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns valid with request id on VIES success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          valid: true,
          name: 'ACME GMBH',
          address: 'Berlin',
          requestIdentifier: 'WAPIAAAA...',
        }),
      }))
    );

    const result = await validateEuVatId({
      country: 'DE',
      vatId: 'DE123456789',
    });
    expect(result).toMatchObject({
      ok: true,
      valid: true,
      countryCode: 'DE',
      vatNumber: '123456789',
      name: 'ACME GMBH',
      requestIdentifier: 'WAPIAAAA...',
    });
  });

  it('returns valid:false for known-invalid VAT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ valid: false }),
      }))
    );

    const result = await validateEuVatId({
      country: 'FR',
      vatId: 'FR12345678901',
    });
    expect(result).toMatchObject({ ok: true, valid: false });
  });

  it('marks VIES outages as retryable failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
      }))
    );

    const result = await validateEuVatId({
      country: 'IE',
      vatId: 'IE1234567T',
    });
    expect(result).toEqual({
      ok: false,
      error: 'VIES HTTP 503',
      retryable: true,
    });
  });
});
