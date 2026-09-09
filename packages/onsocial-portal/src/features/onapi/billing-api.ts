import { ACTIVE_API_URL } from '@/lib/portal-config';

const GATEWAY_BASE = ACTIVE_API_URL.replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────

export interface PlanInfo {
  tier: string;
  name: string;
  price: string;
  amountMinor: number;
  currency: string;
  interval: string;
  rateLimit: number;
  promotion?: {
    name: string;
    discountPercent: number;
    durationCycles: number;
    discountedAmountMinor: number;
    discountedPrice: string;
  };
}

export interface SubscriptionInfo {
  id: string;
  tier: string;
  status: 'pending' | 'active' | 'cancelled' | 'past_due' | 'expired';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  promotionCode: string | null;
  promotionCyclesRemaining: number;
  graceTier: string | null;
  gracePeriodEnd: string | null;
  billingEmail?: string | null;
  billingCountry?: string | null;
  billingCompanyName?: string | null;
  billingVatId?: string | null;
}

export interface SubscribeResult {
  checkoutUrl: string;
  orderId: string;
  subscriptionId: string;
  plan: {
    tier: string;
    name: string;
    price: string;
    rateLimit: number;
  };
  promotion?: {
    code: string;
    name: string;
    discountPercent: number;
    durationCycles: number;
    effectivePrice: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────

async function gw<T>(
  path: string,
  jwt: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`
    );
  }

  return (await res.json()) as T;
}

// ── API calls ─────────────────────────────────────────────────

/** Fetch available subscription plans (public, no auth required) */
export async function fetchPlansPublic(): Promise<PlanInfo[]> {
  const res = await fetch(`${GATEWAY_BASE}/developer/plans`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return []; // Fallback plans will be used
  const data = (await res.json()) as { plans: PlanInfo[] };
  return data.plans;
}

/** Fetch available subscription plans (authenticated) */
export async function fetchPlans(jwt: string): Promise<PlanInfo[]> {
  const data = await gw<{ plans: PlanInfo[] }>('/developer/plans', jwt);
  return data.plans;
}

/** Fetch current subscription for signed-in account */
export async function fetchSubscription(jwt: string): Promise<{
  subscription: SubscriptionInfo | null;
  tier: string;
  admin?: boolean;
}> {
  return gw('/developer/subscription', jwt);
}

export interface SubscribeBillingDetails {
  email: string;
  country: string;
  companyName?: string;
  vatId?: string;
}

/** Create a checkout order and get the redirect URL */
export async function subscribe(
  jwt: string,
  tier: string,
  billing: SubscribeBillingDetails
): Promise<SubscribeResult> {
  return gw('/developer/subscribe', jwt, {
    method: 'POST',
    body: JSON.stringify({
      tier,
      email: billing.email,
      country: billing.country,
      ...(billing.companyName?.trim() && {
        companyName: billing.companyName.trim(),
      }),
      ...(billing.vatId?.trim() && { vatId: billing.vatId.trim() }),
    }),
  });
}

export interface InvoiceInfo {
  id: string;
  invoiceNumber: string;
  tier: string;
  revolutOrderId: string;
  currency: string;
  totalMinor: number;
  netMinor: number;
  taxMinor: number;
  taxRateBps: number;
  taxTreatment: string;
  taxNote: string;
  billingCountry: string;
  billingVatId: string | null;
  issuedAt: string;
  periodStart: string;
  periodEnd: string;
}

export async function fetchInvoices(jwt: string): Promise<InvoiceInfo[]> {
  const data = await gw<{ invoices: InvoiceInfo[] }>(
    '/developer/invoices',
    jwt
  );
  return data.invoices;
}

/** Download invoice PDF (triggers browser save). */
export async function downloadInvoicePdf(
  jwt: string,
  invoiceId: string,
  filenameHint?: string
): Promise<void> {
  const res = await fetch(
    `${GATEWAY_BASE}/developer/invoices/${encodeURIComponent(invoiceId)}/pdf`,
    {
      headers: { Authorization: `Bearer ${jwt}` },
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Failed to download invoice (${res.status})`
    );
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/i.exec(disposition);
  const filename = match?.[1] || filenameHint || `invoice-${invoiceId}.pdf`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Cancel renewal (keeps access until period end) */
export async function cancelSubscription(jwt: string): Promise<void> {
  await gw('/developer/subscription/cancel', jwt, { method: 'POST' });
}

export async function completeDevSubscription(jwt: string): Promise<void> {
  await gw('/developer/subscription/dev-complete', jwt, { method: 'POST' });
}
