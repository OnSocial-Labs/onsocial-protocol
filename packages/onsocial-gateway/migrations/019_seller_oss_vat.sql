-- Snapshot Non-Union OSS VAT ID on developer invoices.

ALTER TABLE developer_invoices
  ADD COLUMN IF NOT EXISTS seller_oss_vat_number TEXT;

COMMENT ON COLUMN developer_invoices.seller_oss_vat_number IS 'Non-Union OSS VAT ID snapshotted at issue (EU B2C)';
