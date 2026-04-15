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
  init?: RequestInit,
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
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
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
export async function fetchSubscription(
  jwt: string,
): Promise<{ subscription: SubscriptionInfo | null; tier: string; admin?: boolean }> {
  return gw('/developer/subscription', jwt);
}

/** Create a checkout order and get the redirect URL */
export async function subscribe(
  jwt: string,
  tier: string,
  email?: string,
): Promise<SubscribeResult> {
  return gw('/developer/subscribe', jwt, {
    method: 'POST',
    body: JSON.stringify({
      tier,
      ...(email && { email }),
    }),
  });
}

/** Cancel renewal (keeps access until period end) */
export async function cancelSubscription(jwt: string): Promise<void> {
  await gw('/developer/subscription/cancel', jwt, { method: 'POST' });
}

export async function completeDevSubscription(jwt: string): Promise<void> {
  await gw('/developer/subscription/dev-complete', jwt, { method: 'POST' });
}
