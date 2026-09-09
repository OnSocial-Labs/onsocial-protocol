/**
 * Seller identity for OnAPI tax invoices (UK seller).
 * Production requires legal name, VAT number, and address.
 */

import { normalizeCountryCode } from './tax.js';

export interface SellerIdentity {
  legalName: string;
  vatNumber: string;
  address: string;
  companyNumber: string | null;
  country: string;
}

export class SellerIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SellerIdentityError';
  }
}

export function requireSellerIdentity(): SellerIdentity {
  const legalName = process.env.BILLING_SELLER_LEGAL_NAME?.trim() || '';
  const vatNumber = process.env.BILLING_SELLER_VAT_NUMBER?.trim() || '';
  const address = process.env.BILLING_SELLER_ADDRESS?.trim() || '';
  const companyNumber =
    process.env.BILLING_SELLER_COMPANY_NUMBER?.trim() || null;
  const country =
    normalizeCountryCode(process.env.BILLING_SELLER_COUNTRY || 'GB') || 'GB';

  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!legalName || !vatNumber || !address) {
      throw new SellerIdentityError(
        'BILLING_SELLER_LEGAL_NAME, BILLING_SELLER_VAT_NUMBER, and BILLING_SELLER_ADDRESS are required in production'
      );
    }
  }

  return {
    legalName: legalName || 'OnSocial Labs Ltd',
    vatNumber: vatNumber || 'GB000000000',
    address: address || 'United Kingdom',
    companyNumber,
    country,
  };
}
