/**
 * Tax invoice PDF for OnAPI subscriptions.
 * Multi-page capable; Helvetica (Latin). Non-Latin chars are stripped to '?'.
 */

import type { InvoiceRecord } from './invoices.js';

function pdfEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/** Helvetica / WinAnsi-safe: replace unsupported chars. */
function latin1Safe(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function money(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency.toUpperCase() === 'USD'
    ? `$${amount}`
    : `${amount} ${currency}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function treatmentLabel(treatment: string): string {
  switch (treatment) {
    case 'uk_vat':
      return 'UK VAT';
    case 'uk_vat_inclusive':
      return 'UK VAT (legacy inclusive)';
    case 'eu_oss_vat':
      return 'EU VAT (OSS)';
    case 'eu_reverse_charge':
      return 'EU reverse charge (Art. 196)';
    case 'eu_b2c_unconfigured':
      return 'EU B2C (VAT OSS pending)';
    case 'us_sales_tax':
      return 'US sales tax';
    case 'ca_gst':
      return 'Canada GST/HST';
    case 'destination_vat':
      return 'Destination VAT/GST';
    case 'out_of_scope':
      return 'Out of scope';
    default:
      return treatment;
  }
}

type Line = { size: number; text: string };

function buildLines(invoice: InvoiceRecord): Line[] {
  const lines: Line[] = [];
  const push = (text: string, size = 10) =>
    lines.push({ size, text: latin1Safe(text) });

  push('TAX INVOICE', 18);
  push(invoice.invoiceNumber, 14);
  push('');
  push(`Tax point / issued: ${formatDate(invoice.issuedAt)}`);
  push(
    `Service period: ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}`
  );
  push('Supply: Electronically supplied services (digital SaaS)');
  push('');

  push('Supplier', 12);
  push(invoice.sellerLegalName, 11);
  push(invoice.sellerAddress);
  push(`Country: ${invoice.sellerCountry}`);
  push(`VAT number: ${invoice.sellerVatNumber}`);
  if (invoice.sellerOssVatNumber) {
    push(`EU OSS VAT number: ${invoice.sellerOssVatNumber}`);
  }
  if (invoice.sellerCompanyNumber) {
    push(`Company number: ${invoice.sellerCompanyNumber}`);
  }
  push('');

  push('Customer', 12);
  if (invoice.billingCompanyName) push(invoice.billingCompanyName, 11);
  push(invoice.billingEmail);
  push(`NEAR account: ${invoice.accountId}`);
  push(`Billing country: ${invoice.billingCountry}`);
  if (invoice.billingRegion) {
    push(`Region: ${invoice.billingRegion}`);
  }
  if (invoice.billingPostalCode) {
    push(`Postal / ZIP: ${invoice.billingPostalCode}`);
  }
  if (invoice.billingVatId) {
    push(
      `VAT / tax ID: ${invoice.billingVatId}${invoice.vatVerified ? ' (VIES verified)' : ''}`
    );
  }
  if (invoice.viesRequestId) {
    push(`VIES consultation: ${invoice.viesRequestId}`);
  }
  push('');

  push('Line items', 12);
  const tierLabel =
    invoice.tier.charAt(0).toUpperCase() + invoice.tier.slice(1);
  push(`1 × OnSocial API ${tierLabel} — monthly subscription`);
  push(`Net plan price: ${money(invoice.netMinor, invoice.currency)}`);
  push(`Payment reference (Revolut): ${invoice.revolutOrderId}`);
  push('');

  push(`Net amount:  ${money(invoice.netMinor, invoice.currency)}`);
  if (invoice.taxMinor > 0) {
    const rate = (invoice.taxRateBps / 100).toFixed(1).replace(/\.0$/, '');
    const taxWord =
      invoice.taxTreatment === 'us_sales_tax'
        ? 'Sales tax'
        : invoice.taxTreatment === 'ca_gst'
          ? 'GST/HST'
          : 'VAT';
    push(`${taxWord} (${rate}%): ${money(invoice.taxMinor, invoice.currency)}`);
  } else if (invoice.taxTreatment === 'eu_reverse_charge') {
    push(`VAT (reverse charge): ${money(0, invoice.currency)}`);
  } else if (
    invoice.taxTreatment === 'out_of_scope' ||
    invoice.taxTreatment === 'eu_b2c_unconfigured'
  ) {
    // Omit a fake $0 VAT line — total-only honesty for unconfigured jurisdictions.
  } else {
    push(`VAT:         ${money(0, invoice.currency)}`);
  }
  push(`Total:       ${money(invoice.totalMinor, invoice.currency)}`, 12);
  push('');
  push(`Tax treatment: ${treatmentLabel(invoice.taxTreatment)}`);

  const note = invoice.taxNote || '';
  for (let i = 0; i < note.length; i += 86) {
    push(note.slice(i, i + 86), 9);
  }
  push('');
  push(
    'This document is the OnSocial tax invoice. Revolut payment receipts are not VAT invoices.',
    8
  );
  return lines;
}

function buildPageContent(lines: Line[], startY = 750): string {
  let y = startY;
  const ops: string[] = ['BT'];
  for (const line of lines) {
    if (!line.text) {
      y -= 10;
      continue;
    }
    if (y < 50) break;
    ops.push(`/F1 ${line.size} Tf`);
    ops.push(`1 0 0 1 50 ${y} Tm`);
    ops.push(`(${pdfEscape(line.text)}) Tj`);
    y -= line.size + 6;
  }
  ops.push('ET');
  return ops.join('\n');
}

function paginate(lines: Line[]): Line[][] {
  const pages: Line[][] = [];
  let current: Line[] = [];
  let y = 750;
  for (const line of lines) {
    const need = line.text ? line.size + 6 : 10;
    if (y - need < 50 && current.length > 0) {
      pages.push(current);
      current = [];
      y = 750;
    }
    current.push(line);
    y -= need;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

function buildPdfDocument(pageStreams: string[]): Buffer {
  const objects: string[] = [];
  // 1 catalog, 2 pages, then per page: page obj + content obj, then font
  const pageCount = pageStreams.length;
  const pageObjIds: number[] = [];
  let nextId = 3;
  for (let i = 0; i < pageCount; i++) {
    pageObjIds.push(nextId);
    nextId += 2; // page + content
  }
  const fontId = nextId;

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj\n`
  );

  for (let i = 0; i < pageCount; i++) {
    const pageId = pageObjIds[i];
    const contentId = pageId + 1;
    const stream = pageStreams[i];
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj\n`
    );
    objects.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  }

  objects.push(
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
  );

  // Rebuild with correct object numbering in array order matching IDs 1..N
  // Our objects array is already in ID order if we push carefully.
  // Object 1,2 then pairs, then font — IDs match.

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export function renderInvoicePdf(invoice: InvoiceRecord): Buffer {
  const pages = paginate(buildLines(invoice));
  const streams = pages.map((pageLines) => buildPageContent(pageLines));
  return buildPdfDocument(streams);
}

export function invoicePdfFilename(invoice: InvoiceRecord): string {
  const safe = invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${safe}.pdf`;
}
