/**
 * Build Merchant Order line_items so Revolut receipts can show Included tax.
 *
 * Subscription plans only carry a flat phase amount; tax must be attached to the
 * pending setup (or renewal) order via PATCH /orders/{id} line_items[].taxes.
 *
 * @see https://developer.revolut.com/docs/merchant/create-order — line_items.taxes
 */

import type { TaxBreakdown, TaxTreatment } from '../billing/tax.js';

export interface RevolutOrderTaxLine {
  name: string;
  amount: number;
}

export interface RevolutOrderLineItem {
  name: string;
  type: 'service';
  quantity: { value: number };
  unit_price_amount: number;
  total_amount: number;
  taxes?: RevolutOrderTaxLine[];
  description?: string;
}

function taxLabel(treatment: TaxTreatment, taxRateBps: number): string {
  const rate = (taxRateBps / 100).toFixed(1).replace(/\.0$/, '');
  switch (treatment) {
    case 'uk_vat':
    case 'eu_oss_vat':
    case 'destination_vat':
    case 'uk_vat_inclusive':
      return `VAT ${rate}%`;
    case 'us_sales_tax':
      return rate === '0' ? 'Sales tax' : `Sales tax ${rate}%`;
    case 'ca_gst':
      return `GST/HST ${rate}%`;
    default:
      return rate === '0' ? 'Tax' : `Tax ${rate}%`;
  }
}

/**
 * Net unit price + tax amount = total (tax-exclusive pricing, matches invoices).
 */
export function buildRevolutTaxLineItems(input: {
  planName: string;
  breakdown: Pick<
    TaxBreakdown,
    'netMinor' | 'taxMinor' | 'totalMinor' | 'taxRateBps' | 'treatment' | 'note'
  >;
}): RevolutOrderLineItem[] {
  const { planName, breakdown } = input;
  const taxes: RevolutOrderTaxLine[] =
    breakdown.taxMinor > 0
      ? [
          {
            name: taxLabel(breakdown.treatment, breakdown.taxRateBps),
            amount: breakdown.taxMinor,
          },
        ]
      : [];

  return [
    {
      name: `OnSocial API ${planName}`,
      type: 'service',
      quantity: { value: 1 },
      unit_price_amount: breakdown.netMinor,
      total_amount: breakdown.totalMinor,
      ...(taxes.length > 0 ? { taxes } : {}),
      ...(breakdown.note ? { description: breakdown.note.slice(0, 250) } : {}),
    },
  ];
}
