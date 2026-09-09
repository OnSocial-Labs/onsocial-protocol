-- Billing identity on subscriptions + developer invoices (UK tax-inclusive lean B).
-- Revolut receipts remain payment confirmations; this table is the tax invoice ledger.

ALTER TABLE developer_subscriptions
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_country TEXT,
  ADD COLUMN IF NOT EXISTS billing_company_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_vat_id TEXT;

COMMENT ON COLUMN developer_subscriptions.billing_email IS 'Billing contact email collected at checkout';
COMMENT ON COLUMN developer_subscriptions.billing_country IS 'ISO 3166-1 alpha-2 billing country';
COMMENT ON COLUMN developer_subscriptions.billing_company_name IS 'Optional company / trading name';
COMMENT ON COLUMN developer_subscriptions.billing_vat_id IS 'Optional VAT / tax ID (normalized)';

CREATE TABLE IF NOT EXISTS developer_invoices (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        TEXT        NOT NULL UNIQUE,
  account_id            TEXT        NOT NULL,
  tier                  TEXT        NOT NULL CHECK (tier IN ('pro', 'scale')),
  revolut_order_id      TEXT        NOT NULL UNIQUE,
  currency              TEXT        NOT NULL,
  total_minor           INT         NOT NULL,
  net_minor             INT         NOT NULL,
  tax_minor             INT         NOT NULL,
  tax_rate_bps          INT         NOT NULL DEFAULT 0,
  tax_treatment         TEXT        NOT NULL,
  tax_note              TEXT        NOT NULL DEFAULT '',
  billing_email         TEXT        NOT NULL,
  billing_country       TEXT        NOT NULL,
  billing_company_name  TEXT,
  billing_vat_id        TEXT,
  seller_legal_name     TEXT        NOT NULL,
  seller_vat_number     TEXT,
  seller_country        TEXT        NOT NULL DEFAULT 'GB',
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_invoices_account_issued
  ON developer_invoices (account_id, issued_at DESC);

COMMENT ON TABLE developer_invoices IS 'Tax invoices for OnAPI subscriptions (system of record; Revolut receipt is not).';
