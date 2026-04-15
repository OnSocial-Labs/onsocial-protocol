'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  X,
  Zap,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { useGatewayAuth } from '@/contexts/gateway-auth-context';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';
import { fadeUpMotion } from '@/lib/motion';
import {
  fetchPlans,
  fetchPlansPublic,
  fetchSubscription,
  subscribe,
  cancelSubscription,
  type PlanInfo,
  type SubscriptionInfo,
} from '@/features/onapi/billing-api';

// ── Tier presentation ─────────────────────────────────────────

const TIER_ACCENT: Record<string, PortalAccent> = {
  free: 'green',
  pro: 'blue',
  scale: 'purple',
};

function tierAccent(tier: string): PortalAccent {
  return TIER_ACCENT[tier] ?? 'slate';
}

function tierRank(tier: string): number {
  const ranks: Record<string, number> = { free: 0, pro: 1, scale: 2 };
  return ranks[tier] ?? -1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Main Page ─────────────────────────────────────────────────

export default function BillingPage() {
  const { accountId, isConnected, connect } = useWallet();
  const { jwt, isAuthenticating: authLoading, authError, ensureAuth } = useGatewayAuth();
  const { setNavBack } = useMobilePageContext();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();

  // Back button in navbar
  useEffect(() => {
    setNavBack({ label: 'Back' });
    return () => setNavBack(null);
  }, [setNavBack]);

  // Checkout return detection
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // Pre-selected tier from landing page
  const requestedTier = searchParams.get('tier') ?? 'pro';

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      // Redirect to unified keys page on checkout success
      window.location.href = '/onapi/keys?checkout=success';
      return;
    }
  }, [searchParams]);

  // Data
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions
  const [upgrading, setUpgrading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const pendingUpgradeRef = useRef(false);

  // Fetch plans (public, no auth)
  useEffect(() => {
    fetchPlansPublic().then((p) => {
      if (p.length > 0) setPlans(p);
    });
  }, []);

  // Fetch subscription when authenticated
  const refresh = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    setError(null);
    try {
      const [planList, subData] = await Promise.all([
        fetchPlans(jwt),
        fetchSubscription(jwt).catch(() => ({ subscription: null, tier: 'free' as string })),
      ]);
      setPlans(planList);
      setSubscription(subData.subscription);
      setCurrentTier(subData.tier);
    } catch {
      // Plan fetch failed — keep existing plans, non-blocking
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    if (jwt) refresh();
  }, [jwt, refresh]);

  // The plan the user wants to subscribe to
  const targetPlan = plans.find((p) => p.tier === requestedTier) ?? plans[0];
  const accent = targetPlan ? tierAccent(targetPlan.tier) : 'blue';
  const alreadyOnTier = currentTier === requestedTier;
  const requiresCancelFirst =
    tierRank(requestedTier) <= tierRank(currentTier) && !alreadyOnTier;

  const emailValid = EMAIL_RE.test(billingEmail.trim());
  const showEmailHint = emailTouched && billingEmail.trim().length > 0 && !emailValid;

  // ── Subscribe ─────────────────────────────────────────────────

  const executeUpgrade = useCallback(async () => {
    if (!emailValid) return;
    setUpgrading(true);
    setError(null);
    try {
      const token = await ensureAuth();
      if (!token) { setUpgrading(false); return; }
      const result = await subscribe(token, requestedTier, billingEmail.trim());
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setUpgrading(false);
    }
  }, [ensureAuth, billingEmail, requestedTier, emailValid]);

  const handleSubscribe = async () => {
    if (!emailValid) return;
    setUpgrading(true);
    setError(null);
    if (!isConnected) {
      pendingUpgradeRef.current = true;
      await connect();
      return;
    }
    await executeUpgrade();
  };

  useEffect(() => {
    if (isConnected && accountId && pendingUpgradeRef.current) {
      pendingUpgradeRef.current = false;
      executeUpgrade();
    }
  }, [isConnected, accountId, executeUpgrade]);

  // ── Cancel ────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (!jwt) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelSubscription(jwt);
      setConfirmCancel(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <PageShell className="max-w-xl space-y-6">
      <SecondaryPageHeader
        badge="Billing"
        badgeAccent="purple"
      />

      {/* ── Auth loading ──────────────────────────────────── */}
      {authLoading && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border/30 bg-background/30 px-4 py-2.5">
          <PulsingDots size="sm" />
          <span className="text-xs text-muted-foreground">
            Waiting for wallet approval…
          </span>
        </div>
      )}

      {/* ── Auth error ────────────────────────────────────── */}
      {authError && (
        <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/30 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 portal-amber-text shrink-0" />
          <p className="flex-1 text-xs text-foreground">{authError}</p>
          <Button onClick={ensureAuth} variant="outline" size="xs">Retry</Button>
        </div>
      )}

      {/* ── Checkout success ──────────────────────────────── */}
      {checkoutSuccess && (
        <motion.div
          {...fadeUpMotion(!!reduceMotion, { distance: 8, duration: 0.24 })}
          className="rounded-lg border border-[var(--portal-green-border)] bg-[var(--portal-green-bg)] px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 portal-green-text shrink-0" />
            <p className="flex-1 text-sm font-medium portal-green-text">
              Payment complete — your plan is active. Next, create your API key.
            </p>
            <button onClick={() => setCheckoutSuccess(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 pl-8">
            <Link
              href="/onapi/keys"
              className="portal-green-surface inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:brightness-110"
            >
              Create API key
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.div>
      )}

      {/* ── Error (network / server) ───────────────────── */}
      {error && (
        <div className="portal-amber-panel rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* ── Loading ───────────────────────────────────────── */}
      {loading && (
        <div className="py-12 text-center"><PulsingDots size="md" /></div>
      )}

      {/* ── Active subscription management ────────────────── */}
      {!loading && subscription && !['expired', 'pending'].includes(subscription.status) && (
        <motion.div
          {...fadeUpMotion(!!reduceMotion, { distance: 12 })}
        >
          <SurfacePanel radius="xl" tone="soft" padding="roomy">
            <div className="flex items-center gap-3 mb-3">
              <PortalBadge accent={tierAccent(subscription.tier)} size="sm">
                {subscription.tier}
              </PortalBadge>
              <span className="text-sm text-muted-foreground">
                {subscription.status === 'active' ? 'Active' : subscription.status === 'cancelled' ? 'Cancelling' : 'Past due'}
              </span>
              {subscription.promotionCode && (
                <PortalBadge accent="amber" size="xs">
                  {subscription.promotionCode}
                  {subscription.promotionCyclesRemaining > 0
                    && ` · ${subscription.promotionCyclesRemaining} left`}
                </PortalBadge>
              )}
            </div>

            <StatStrip columns={2}>
              <StatStripCell label="Period" showDivider>
                {new Date(subscription.currentPeriodStart).toLocaleDateString()}
                {' → '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </StatStripCell>
              <StatStripCell label={subscription.status === 'cancelled' ? 'Expires' : 'Renews'}>
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </StatStripCell>
            </StatStrip>

            {subscription.status === 'active' && (
              <div className="mt-4">
                {confirmCancel ? (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs text-muted-foreground">
                      Access continues until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. Sure?
                    </p>
                    <Button variant="destructive" size="xs" loading={cancelling} onClick={handleCancel}>
                      Confirm
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setConfirmCancel(false)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setConfirmCancel(true)} className="text-muted-foreground">
                    Cancel renewal
                  </Button>
                )}
              </div>
            )}

            {subscription.status === 'cancelled' && (
              <p className="mt-3 text-xs text-muted-foreground">
                Your {subscription.tier} access continues until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}, then reverts to free.
              </p>
            )}

            {subscription.status === 'past_due' && (
              <p className="mt-3 text-xs portal-red-text">
                Payment failed. Subscribe again to keep your plan.
              </p>
            )}
          </SurfacePanel>
        </motion.div>
      )}

      {/* ── Upgrade checkout (only when not already on this tier) ── */}
      {!loading && targetPlan && !alreadyOnTier && !requiresCancelFirst && (
        <motion.div
          {...fadeUpMotion(!!reduceMotion, { distance: 16, duration: 0.3 })}
        >
          <SurfacePanel
            radius="xl"
            tone="soft"
            padding="roomy"
            className={`border-[color-mix(in_srgb,${portalColors[accent]}_30%,transparent)]`}
            style={{
              borderColor: `color-mix(in srgb, ${portalColors[accent]} 30%, transparent)`,
            }}
          >
            {/* Plan summary */}
            <div className="flex items-center gap-3 mb-1">
              <Zap className="h-5 w-5" style={{ color: portalColors[accent] }} />
              <h3 className="text-lg font-bold tracking-[-0.02em]" style={{ color: portalColors[accent] }}>
                {targetPlan.name}
              </h3>
            </div>
            <div className="flex items-baseline gap-1.5 mb-4">
              {targetPlan.promotion ? (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    ${(targetPlan.amountMinor / 100).toFixed(0)}
                  </span>
                  <span className="text-3xl font-bold tracking-[-0.03em]">
                    ${(targetPlan.promotion.discountedAmountMinor / 100).toFixed(0)}
                  </span>
                  <span className="text-sm text-muted-foreground">/{targetPlan.interval}</span>
                  <span className="ml-2 text-xs font-medium portal-green-text">
                    {targetPlan.promotion.discountPercent}% off
                    {targetPlan.promotion.durationCycles > 0
                      ? ` for ${targetPlan.promotion.durationCycles} mo`
                      : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-bold tracking-[-0.03em]">
                    ${(targetPlan.amountMinor / 100).toFixed(0)}
                  </span>
                  <span className="text-sm text-muted-foreground">/{targetPlan.interval}</span>
                </>
              )}
            </div>

            <StatStrip columns={2} className="mb-2">
              <StatStripCell
                label="Requests"
                value={`${targetPlan.rateLimit.toLocaleString()} /min`}
                showDivider
              />
              <StatStripCell
                label="Aggregations"
                value="Yes"
                valueClassName="portal-green-text"
              />
            </StatStrip>

            {/* Email + subscribe */}
            <div className="space-y-3">
              <SurfacePanel
                radius="md"
                tone="inset"
                borderTone="subtle"
                padding="none"
                className="flex items-center gap-3 px-4 py-3 transition-[border-color] duration-150 ease focus-within:border-[var(--_focus-accent)]"
                style={{ '--_focus-accent': `color-mix(in srgb, ${portalColors[accent]} 50%, transparent)` } as React.CSSProperties}
              >
                <input
                  id="billing-email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => { setBillingEmail(e.target.value); setEmailTouched(false); }}
                  onBlur={() => setEmailTouched(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                  placeholder="Billing email"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium tracking-[-0.01em] outline-none placeholder:text-muted-foreground/50"
                />
              </SurfacePanel>
              <div className="min-h-5">
                <AnimatePresence initial={false}>
                  {showEmailHint && (
                    <motion.div
                      key="email-hint"
                      {...fadeUpMotion(!!reduceMotion, { distance: 4, duration: 0.18 })}
                      className="flex items-start gap-2 text-xs text-amber-500/90"
                    >
                      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>Enter a valid email address</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Button
                onClick={handleSubscribe}
                loading={upgrading}
                disabled={upgrading || !emailValid}
                variant={accent === 'purple' ? 'secondary' : 'default'}
                className="w-full justify-center"
                size="cta"
              >
                Continue to checkout
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Checkout first, then create your API key right after payment. Billed monthly via Revolut. Cancel anytime.
              </p>
            </div>
          </SurfacePanel>
        </motion.div>
      )}

      {/* ── Already on this tier ──────────────────────────── */}
      {!loading && alreadyOnTier && (
        <div className="text-center text-sm text-muted-foreground">
          You&apos;re already on the{' '}
          <span style={{ color: portalColors[accent] }} className="font-medium">
            {targetPlan?.name}
          </span>{' '}
          plan.{' '}
          <Link href="/onapi/keys" className="underline hover:text-foreground">
            Manage keys →
          </Link>
        </div>
      )}

      {/* ── Lower-tier flow notice ───────────────────────── */}
      {!loading && requiresCancelFirst && (
        <div className="text-center text-sm text-muted-foreground">
          You&apos;re on a higher plan. Cancel renewal first, keep access until it ends, then buy this plan later if you still need it.
        </div>
      )}
    </PageShell>
  );
}
