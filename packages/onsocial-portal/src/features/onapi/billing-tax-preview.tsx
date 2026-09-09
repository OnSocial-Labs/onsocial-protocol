'use client';

import { useEffect, useState } from 'react';
import {
  fetchTaxPreview,
  type TaxPreviewInfo,
} from '@/features/onapi/billing-api';
import { SurfacePanel } from '@/components/ui/surface-panel';

/** Short, non-tutorial copy for the checkout summary. */
function consumerSummary(preview: TaxPreviewInfo): {
  eyebrow: string;
  detail: string | null;
} {
  switch (preview.taxTreatment) {
    case 'uk_vat_inclusive':
      return {
        eyebrow: 'You pay',
        detail: `Includes VAT ${preview.taxFormatted} (${(
          preview.taxRateBps / 100
        ).toFixed(0)}%)`,
      };
    case 'eu_reverse_charge':
      return {
        eyebrow: 'You pay',
        detail: 'Business VAT ID verified — reverse charge on your invoice',
      };
    case 'eu_b2c_unconfigured':
      return {
        eyebrow: 'You pay',
        detail: preview.billingVatId
          ? 'VAT ID will be checked at checkout'
          : 'Personal / no VAT ID — same total',
      };
    case 'out_of_scope':
      return {
        eyebrow: 'You pay',
        detail: 'No VAT on this invoice for your country',
      };
    default:
      return { eyebrow: 'You pay', detail: null };
  }
}

export function useBillingTaxPreview(input: {
  jwt: string | null;
  tier: string | null | undefined;
  country: string;
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
    companyName = '',
    vatId = '',
    enabled = true,
  } = input;
  const [preview, setPreview] = useState<TaxPreviewInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = Boolean(enabled && tier && country);

  useEffect(() => {
    if (!active || !tier || !country) {
      return;
    }

    let cancelled = false;
    const vatTrimmed = vatId.trim();
    // Verify EU VAT once the id looks complete enough; needs wallet JWT.
    const verifyVat = Boolean(jwt) && vatTrimmed.length >= 8;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchTaxPreview(
        {
          tier,
          country,
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
  }, [active, jwt, tier, country, companyName, vatId]);

  return {
    preview: active ? preview : null,
    loading: active ? loading : false,
    error: active ? error : null,
  };
}

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

  const summary = preview ? consumerSummary(preview) : null;

  return (
    <SurfacePanel
      radius="md"
      tone="inset"
      borderTone="subtle"
      padding="snug"
      className="space-y-1.5"
      aria-live="polite"
    >
      {loading && !preview ? (
        <p className="text-xs text-muted-foreground">Updating total…</p>
      ) : preview && summary ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {summary.eyebrow}
            </span>
            <span className="text-lg font-semibold tabular-nums tracking-[-0.03em] text-foreground">
              {preview.totalFormatted}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                /mo
              </span>
            </span>
          </div>
          {summary.detail ? (
            <p className="text-right text-[11px] leading-relaxed text-muted-foreground/75">
              {summary.detail}
            </p>
          ) : null}
        </>
      ) : null}
    </SurfacePanel>
  );
}
