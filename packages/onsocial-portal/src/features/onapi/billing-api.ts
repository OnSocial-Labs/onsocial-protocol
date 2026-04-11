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
}

export interface SubscriptionInfo {
  id: string;
  tier: string;
  status: 'active' | 'cancelled' | 'past_due' | 'expired';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  promotionCode: string | null;
  promotionCyclesRemaining: number;
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

/** Fetch available subscription plans (public, but JWT simplifies auth) */
export async function fetchPlans(jwt: string): Promise<PlanInfo[]> {
  const data = await gw<{ plans: PlanInfo[] }>('/developer/plans', jwt);
  return data.plans;
}

/** Fetch current subscription for signed-in account */
export async function fetchSubscription(
  jwt: string,
): Promise<{ subscription: SubscriptionInfo | null; tier: string }> {
  return gw('/developer/subscription', jwt);
}

/** Create a checkout order and get the redirect URL */
export async function subscribe(
  jwt: string,
  tier: string,
  email?: string,
  promoCode?: string,
): Promise<SubscribeResult> {
  return gw('/developer/subscribe', jwt, {
    method: 'POST',
    body: JSON.stringify({
      tier,
      ...(email && { email }),
      ...(promoCode && { promoCode }),
    }),
  });
}

/** Cancel subscription (keeps access until period end) */
export async function cancelSubscription(jwt: string): Promise<void> {
  await gw('/developer/subscription/cancel', jwt, { method: 'POST' });
}
