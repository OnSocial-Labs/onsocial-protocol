/**
 * EU VIES VAT number validation (REST).
 * Used before granting EU reverse-charge treatment.
 *
 * POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
 */

import { logger } from '../../logger.js';
import { EU_COUNTRY_CODES, normalizeVatId } from './tax.js';

const VIES_URL =
  process.env.VIES_CHECK_URL?.trim() ||
  'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

const VIES_TIMEOUT_MS = Number(process.env.VIES_TIMEOUT_MS || 8_000);

export type ViesResult =
  | {
      ok: true;
      valid: true;
      countryCode: string;
      vatNumber: string;
      name: string | null;
      address: string | null;
      requestIdentifier: string | null;
    }
  | {
      ok: true;
      valid: false;
      countryCode: string;
      vatNumber: string;
      reason: string;
    }
  | { ok: false; error: string; retryable: boolean };

function splitVatId(
  country: string,
  vatId: string
): { countryCode: string; vatNumber: string } | null {
  const normalized = normalizeVatId(vatId);
  if (!normalized) return null;

  let countryCode = country.toUpperCase();
  let vatNumber = normalized;

  // Strip leading country prefix if present (DE123… → 123…)
  if (normalized.startsWith(countryCode) && normalized.length > 2) {
    vatNumber = normalized.slice(2);
  } else if (/^[A-Z]{2}/.test(normalized)) {
    countryCode = normalized.slice(0, 2);
    vatNumber = normalized.slice(2);
  }

  if (!EU_COUNTRY_CODES.has(countryCode) && countryCode !== 'XI') {
    return null;
  }
  if (!vatNumber || vatNumber.length < 2) return null;
  return { countryCode, vatNumber };
}

/**
 * Validate an EU VAT ID via VIES.
 * Returns valid:false for known-invalid; ok:false when VIES is unavailable.
 */
export async function validateEuVatId(input: {
  country: string;
  vatId: string;
}): Promise<ViesResult> {
  const parts = splitVatId(input.country, input.vatId);
  if (!parts) {
    return {
      ok: true,
      valid: false,
      countryCode: input.country.toUpperCase(),
      vatNumber: input.vatId,
      reason: 'Invalid VAT ID format for EU reverse charge',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIES_TIMEOUT_MS);

  try {
    const res = await fetch(VIES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        countryCode: parts.countryCode,
        vatNumber: parts.vatNumber,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn(
        { status: res.status, country: parts.countryCode },
        'VIES HTTP error'
      );
      return {
        ok: false,
        error: `VIES HTTP ${res.status}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    }

    const body = (await res.json()) as {
      valid?: boolean;
      name?: string;
      address?: string;
      requestIdentifier?: string;
      userError?: string;
      errorWrappers?: Array<{ error?: string }>;
    };

    if (typeof body.valid !== 'boolean') {
      const msg =
        body.userError ||
        body.errorWrappers?.[0]?.error ||
        'Unexpected VIES response';
      return { ok: false, error: msg, retryable: true };
    }

    if (!body.valid) {
      return {
        ok: true,
        valid: false,
        countryCode: parts.countryCode,
        vatNumber: parts.vatNumber,
        reason: 'VAT number is not valid according to VIES',
      };
    }

    return {
      ok: true,
      valid: true,
      countryCode: parts.countryCode,
      vatNumber: parts.vatNumber,
      name: body.name && body.name !== '---' ? body.name : null,
      address: body.address && body.address !== '---' ? body.address : null,
      requestIdentifier: body.requestIdentifier || null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, country: parts.countryCode }, 'VIES request failed');
    return {
      ok: false,
      error: message,
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
