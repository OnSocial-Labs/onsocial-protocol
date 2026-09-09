-- Harden developer invoices: sequential numbers + seller address fields.

CREATE SEQUENCE IF NOT EXISTS developer_invoice_number_seq AS BIGINT START WITH 1 INCREMENT BY 1;

ALTER TABLE developer_invoices
  ADD COLUMN IF NOT EXISTS seller_address TEXT,
  ADD COLUMN IF NOT EXISTS seller_company_number TEXT,
  ADD COLUMN IF NOT EXISTS vies_request_id TEXT,
  ADD COLUMN IF NOT EXISTS vat_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON SEQUENCE developer_invoice_number_seq IS 'Monotonic counter for INV-YYYY-NNNNNN invoice numbers';
COMMENT ON COLUMN developer_invoices.seller_address IS 'Seller registered address snapshotted at issue time';
COMMENT ON COLUMN developer_invoices.seller_company_number IS 'Companies House / registration number if set';
COMMENT ON COLUMN developer_invoices.vies_request_id IS 'VIES consultation id when reverse charge applied';
COMMENT ON COLUMN developer_invoices.vat_verified IS 'True when buyer VAT ID was verified (e.g. VIES) at checkout';

ALTER TABLE developer_subscriptions
  ADD COLUMN IF NOT EXISTS billing_vat_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_vies_request_id TEXT;

COMMENT ON COLUMN developer_subscriptions.billing_vat_verified IS 'Buyer VAT verified via VIES (or equivalent) at subscribe';
COMMENT ON COLUMN developer_subscriptions.billing_vies_request_id IS 'Last VIES request identifier from subscribe';
