/**
 * Developer billing invoices — system of record for tax (Revolut receipts are not).
 *
 * Memory store when DATABASE_URL is unset; PostgreSQL otherwise.
 * Invoice numbers are sequential: INV-YYYY-NNNNNN.
 */

import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { logger } from '../../logger.js';
import type { Tier } from '../../types/index.js';
import {
  computeTaxBreakdown,
  normalizeCountryCode,
  normalizePostalCode,
  normalizeRegionCode,
  normalizeVatId,
  type TaxTreatment,
} from './tax.js';
import { requireSellerIdentity } from './seller.js';

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  accountId: string;
  tier: Tier;
  revolutOrderId: string;
  currency: string;
  totalMinor: number;
  netMinor: number;
  taxMinor: number;
  taxRateBps: number;
  taxTreatment: TaxTreatment;
  taxNote: string;
  billingEmail: string;
  billingCountry: string;
  billingCompanyName: string | null;
  billingVatId: string | null;
  billingRegion: string | null;
  billingPostalCode: string | null;
  vatVerified: boolean;
  viesRequestId: string | null;
  sellerLegalName: string;
  sellerVatNumber: string;
  sellerAddress: string;
  sellerCompanyNumber: string | null;
  sellerCountry: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  createdAt: string;
}

export interface CreateInvoiceInput {
  accountId: string;
  tier: Tier;
  revolutOrderId: string;
  currency: string;
  /** Net plan amount (after promo), excl. tax — total is computed from jurisdiction. */
  netMinor: number;
  billingEmail: string;
  billingCountry: string;
  billingCompanyName?: string | null;
  billingVatId?: string | null;
  billingRegion?: string | null;
  billingPostalCode?: string | null;
  vatVerified?: boolean;
  viesRequestId?: string | null;
  periodStart: string;
  periodEnd: string;
}

export class InvoiceIssuanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceIssuanceError';
  }
}

interface InvoiceStore {
  createIfAbsent(input: CreateInvoiceInput): Promise<InvoiceRecord>;
  listByAccount(accountId: string): Promise<InvoiceRecord[]>;
  getById(accountId: string, invoiceId: string): Promise<InvoiceRecord | null>;
  getByOrderId(revolutOrderId: string): Promise<InvoiceRecord | null>;
}

function formatInvoiceNumber(seq: number, issuedAt: Date): string {
  const y = issuedAt.getUTCFullYear();
  return `INV-${y}-${String(seq).padStart(6, '0')}`;
}

function toInvoice(
  input: CreateInvoiceInput,
  id: string,
  invoiceNumber: string,
  issuedAt: string
): InvoiceRecord {
  const country = normalizeCountryCode(input.billingCountry);
  if (!country) {
    throw new InvoiceIssuanceError('Invalid billing country for invoice');
  }
  if (!input.billingEmail?.trim()) {
    throw new InvoiceIssuanceError('Billing email required for invoice');
  }

  const vatVerified = Boolean(input.vatVerified);
  const billingRegion = normalizeRegionCode(country, input.billingRegion);
  const billingPostalCode = normalizePostalCode(country, input.billingPostalCode);
  const breakdown = computeTaxBreakdown({
    netMinor: input.netMinor,
    currency: input.currency,
    identity: {
      country,
      region: billingRegion,
      postalCode: billingPostalCode,
      vatId: input.billingVatId,
      companyName: input.billingCompanyName,
      vatVerified,
    },
  });
  const seller = requireSellerIdentity();

  return {
    id,
    invoiceNumber,
    accountId: input.accountId,
    tier: input.tier,
    revolutOrderId: input.revolutOrderId,
    currency: breakdown.currency,
    totalMinor: breakdown.totalMinor,
    netMinor: breakdown.netMinor,
    taxMinor: breakdown.taxMinor,
    taxRateBps: breakdown.taxRateBps,
    taxTreatment: breakdown.treatment,
    taxNote: breakdown.note,
    billingEmail: input.billingEmail.trim(),
    billingCountry: country,
    billingCompanyName: input.billingCompanyName?.trim() || null,
    billingVatId: normalizeVatId(input.billingVatId),
    billingRegion,
    billingPostalCode,
    vatVerified,
    viesRequestId: input.viesRequestId?.trim() || null,
    sellerLegalName: seller.legalName,
    sellerVatNumber: seller.vatNumber,
    sellerAddress: seller.address,
    sellerCompanyNumber: seller.companyNumber,
    sellerCountry: seller.country,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    issuedAt,
    createdAt: issuedAt,
  };
}

class MemoryInvoiceStore implements InvoiceStore {
  private byId = new Map<string, InvoiceRecord>();
  private byOrder = new Map<string, string>();
  private byAccount = new Map<string, Set<string>>();
  private seq = 0;

  async getByOrderId(revolutOrderId: string): Promise<InvoiceRecord | null> {
    const id = this.byOrder.get(revolutOrderId);
    return id ? (this.byId.get(id) ?? null) : null;
  }

  async createIfAbsent(input: CreateInvoiceInput): Promise<InvoiceRecord> {
    const existing = await this.getByOrderId(input.revolutOrderId);
    if (existing) return existing;

    const now = new Date();
    this.seq += 1;
    const invoice = toInvoice(
      input,
      randomUUID(),
      formatInvoiceNumber(this.seq, now),
      now.toISOString()
    );
    this.byId.set(invoice.id, invoice);
    this.byOrder.set(invoice.revolutOrderId, invoice.id);
    let set = this.byAccount.get(invoice.accountId);
    if (!set) {
      set = new Set();
      this.byAccount.set(invoice.accountId, set);
    }
    set.add(invoice.id);
    return invoice;
  }

  async listByAccount(accountId: string): Promise<InvoiceRecord[]> {
    const ids = this.byAccount.get(accountId);
    if (!ids) return [];
    return [...ids]
      .map((id) => this.byId.get(id)!)
      .filter(Boolean)
      .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  }

  async getById(
    accountId: string,
    invoiceId: string
  ): Promise<InvoiceRecord | null> {
    const inv = this.byId.get(invoiceId);
    if (!inv || inv.accountId !== accountId) return null;
    return inv;
  }
}

class PostgresInvoiceStore implements InvoiceStore {
  constructor(private pool: Pool) {}

  private mapRow(row: Record<string, unknown>): InvoiceRecord {
    return {
      id: row.id as string,
      invoiceNumber: row.invoice_number as string,
      accountId: row.account_id as string,
      tier: row.tier as Tier,
      revolutOrderId: row.revolut_order_id as string,
      currency: row.currency as string,
      totalMinor: Number(row.total_minor),
      netMinor: Number(row.net_minor),
      taxMinor: Number(row.tax_minor),
      taxRateBps: Number(row.tax_rate_bps),
      taxTreatment: row.tax_treatment as TaxTreatment,
      taxNote: row.tax_note as string,
      billingEmail: row.billing_email as string,
      billingCountry: row.billing_country as string,
      billingCompanyName: (row.billing_company_name as string) || null,
      billingVatId: (row.billing_vat_id as string) || null,
      billingRegion: (row.billing_region as string) || null,
      billingPostalCode: (row.billing_postal_code as string) || null,
      vatVerified: Boolean(row.vat_verified),
      viesRequestId: (row.vies_request_id as string) || null,
      sellerLegalName: row.seller_legal_name as string,
      sellerVatNumber: (row.seller_vat_number as string) || '',
      sellerAddress: (row.seller_address as string) || '',
      sellerCompanyNumber: (row.seller_company_number as string) || null,
      sellerCountry: row.seller_country as string,
      periodStart: new Date(row.period_start as string).toISOString(),
      periodEnd: new Date(row.period_end as string).toISOString(),
      issuedAt: new Date(row.issued_at as string).toISOString(),
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }

  async getByOrderId(revolutOrderId: string): Promise<InvoiceRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM developer_invoices WHERE revolut_order_id = $1 LIMIT 1`,
      [revolutOrderId]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  async createIfAbsent(input: CreateInvoiceInput): Promise<InvoiceRecord> {
    const existing = await this.getByOrderId(input.revolutOrderId);
    if (existing) return existing;

    const now = new Date();
    const seqResult = await this.pool.query<{ n: string }>(
      `SELECT nextval('developer_invoice_number_seq')::text AS n`
    );
    const seq = Number(seqResult.rows[0]?.n);
    if (!Number.isFinite(seq) || seq < 1) {
      throw new InvoiceIssuanceError('Failed to allocate invoice number');
    }

    const invoice = toInvoice(
      input,
      randomUUID(),
      formatInvoiceNumber(seq, now),
      now.toISOString()
    );

    try {
      await this.pool.query(
        `INSERT INTO developer_invoices (
           id, invoice_number, account_id, tier, revolut_order_id,
           currency, total_minor, net_minor, tax_minor, tax_rate_bps,
           tax_treatment, tax_note, billing_email, billing_country,
           billing_company_name, billing_vat_id, billing_region, billing_postal_code,
           vat_verified, vies_request_id,
           seller_legal_name, seller_vat_number, seller_address,
           seller_company_number, seller_country, period_start, period_end,
           issued_at, created_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
         )`,
        [
          invoice.id,
          invoice.invoiceNumber,
          invoice.accountId,
          invoice.tier,
          invoice.revolutOrderId,
          invoice.currency,
          invoice.totalMinor,
          invoice.netMinor,
          invoice.taxMinor,
          invoice.taxRateBps,
          invoice.taxTreatment,
          invoice.taxNote,
          invoice.billingEmail,
          invoice.billingCountry,
          invoice.billingCompanyName,
          invoice.billingVatId,
          invoice.billingRegion,
          invoice.billingPostalCode,
          invoice.vatVerified,
          invoice.viesRequestId,
          invoice.sellerLegalName,
          invoice.sellerVatNumber,
          invoice.sellerAddress,
          invoice.sellerCompanyNumber,
          invoice.sellerCountry,
          invoice.periodStart,
          invoice.periodEnd,
          invoice.issuedAt,
          invoice.createdAt,
        ]
      );
      return invoice;
    } catch (err) {
      const again = await this.getByOrderId(input.revolutOrderId);
      if (again) return again;
      throw err;
    }
  }

  async listByAccount(accountId: string): Promise<InvoiceRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM developer_invoices
       WHERE account_id = $1
       ORDER BY issued_at DESC`,
      [accountId]
    );
    return result.rows.map((row) =>
      this.mapRow(row as Record<string, unknown>)
    );
  }

  async getById(
    accountId: string,
    invoiceId: string
  ): Promise<InvoiceRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM developer_invoices
       WHERE id = $1 AND account_id = $2
       LIMIT 1`,
      [invoiceId, accountId]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }
}

function createInvoiceStore(): InvoiceStore {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    logger.info(
      process.env.NODE_ENV === 'production'
        ? 'Invoice store: PostgreSQL'
        : 'Invoice store: PostgreSQL (dev)'
    );
    return new PostgresInvoiceStore(
      new Pool({ connectionString: databaseUrl })
    );
  }
  logger.info('Invoice store: in-memory');
  return new MemoryInvoiceStore();
}

export const invoiceStore = createInvoiceStore();

/** Create invoice after paid webhook; idempotent on revolut order id. Throws on failure. */
export async function issueInvoiceForOrder(
  input: CreateInvoiceInput
): Promise<InvoiceRecord> {
  if (!input.billingCountry || !input.billingEmail) {
    throw new InvoiceIssuanceError(
      'Cannot issue invoice without billing country and email'
    );
  }

  const invoice = await invoiceStore.createIfAbsent(input);
  logger.info(
    {
      accountId: invoice.accountId,
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.revolutOrderId,
      treatment: invoice.taxTreatment,
      taxMinor: invoice.taxMinor,
      totalMinor: invoice.totalMinor,
    },
    'Developer invoice issued'
  );
  return invoice;
}
