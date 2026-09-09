'use client';

import { useEffect, useState } from 'react';
import {
  fetchTaxPreview,
  type TaxPreviewInfo,
} from '@/features/onapi/billing-api';
import { SurfacePanel } from '@/components/ui/surface-panel';

function vatLineLabel(preview: TaxPreviewInfo): string {
  if (preview.taxMinor > 0) {
    const rate = (preview.taxRateBps / 100).toFixed(1).replace(/\.0$/, '');
    if (preview.taxTreatment === 'eu_oss_vat') {
      return `VAT / OSS (${rate}%)`;
    }
    if (preview.taxTreatment === 'uk_vat') {
      return `VAT (${rate}%)`;
    }
    if (preview.taxTreatment === 'us_sales_tax') {
      return `Sales tax (${rate}%)`;
    }
    if (preview.taxTreatment === 'ca_gst') {
      return `GST/HST (${rate}%)`;
    }
    if (preview.taxTreatment === 'destination_vat') {
      return `VAT/GST (${rate}%)`;
    }
    return `Tax (${rate}%)`;
  }
  if (preview.taxTreatment === 'eu_reverse_charge') {
    return 'VAT (reverse charge)';
  }
  return 'Tax';
}

function showTaxLine(preview: TaxPreviewInfo): boolean {
  return preview.taxMinor > 0 || preview.taxTreatment === 'eu_reverse_charge';
}

export function useBillingTaxPreview(input: {
  jwt: string | null;
  tier: string | null | undefined;
  country: string;
  region?: string;
  postalCode?: string;
  line1?: string;
  city?: string;
  companyName?: string;
  vatId?: string;
  enabled?: boolean;
}): {
  preview: TaxPreviewInfo | null;
  loading: boolean;
  error: string | null;
} {
  const {
    jwt,
    tier,
    country,
    region = '',
    postalCode = '',
    line1 = '',
    city = '',
    companyName = '',
    vatId = '',
    enabled = true,
  } = input;
  const [preview, setPreview] = useState<TaxPreviewInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsRegion = country === 'US' || country === 'CA';
  const needsPostal = country === 'US';
  const locationReady =
    Boolean(country) &&
    (!needsRegion || Boolean(region.trim())) &&
    (!needsPostal || Boolean(postalCode.trim()));
  const active = Boolean(enabled && tier && locationReady);

  useEffect(() => {
    if (!active || !tier || !country) {
      return;
    }

    let cancelled = false;
    const vatTrimmed = vatId.trim();
    const verifyVat = Boolean(jwt) && vatTrimmed.length >= 8;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchTaxPreview(
        {
          tier,
          country,
          region: region.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
          line1: line1.trim() || undefined,
          city: city.trim() || undefined,
          companyName,
          vatId: vatTrimmed || undefined,
          verifyVat,
        },
        jwt
      )
        .then((data) => {
          if (cancelled) return;
          setPreview(data);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setPreview(null);
          setError(
            err instanceof Error ? err.message : 'Could not preview tax'
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    active,
    jwt,
    tier,
    country,
    region,
    postalCode,
    line1,
    city,
    companyName,
    vatId,
  ]);

  return {
    preview: active ? preview : null,
    loading: active ? loading : false,
    error: active ? error : null,
  };
}

/**
 * Standard checkout math: subtotal → VAT → total.
 * Country (+ optional business VAT ID) drives the numbers; no tutorial copy.
 */
export function BillingTaxPreviewPanel({
  preview,
  loading,
  error,
}: {
  preview: TaxPreviewInfo | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="text-xs text-amber-500/90" role="status">
        {error}
      </p>
    );
  }

  if (!preview && !loading) return null;

  return (
    <SurfacePanel
      radius="md"
      tone="inset"
      borderTone="subtle"
      padding="snug"
      className="space-y-2"
      aria-live="polite"
    >
      {loading && !preview ? (
        <p className="text-xs text-muted-foreground">Updating…</p>
      ) : preview ? (
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {showTaxLine(preview) ? (
            <>
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-right font-medium tabular-nums">
                {preview.netFormatted}
              </span>
              <span className="text-muted-foreground">
                {vatLineLabel(preview)}
              </span>
              <span className="text-right font-medium tabular-nums">
                {preview.taxFormatted}
              </span>
            </>
          ) : null}
          <span
            className={
              showTaxLine(preview)
                ? 'border-t border-border/40 pt-1.5 font-medium text-foreground'
                : 'font-medium text-foreground'
            }
          >
            Total
          </span>
          <span
            className={
              showTaxLine(preview)
                ? 'border-t border-border/40 pt-1.5 text-right text-base font-semibold tabular-nums tracking-[-0.02em]'
                : 'text-right text-base font-semibold tabular-nums tracking-[-0.02em]'
            }
          >
            {preview.totalFormatted}
          </span>
        </div>
      ) : null}
    </SurfacePanel>
  );
}
