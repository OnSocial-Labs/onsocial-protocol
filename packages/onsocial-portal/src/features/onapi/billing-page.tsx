'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Shield,
  AlertTriangle,
  Check,
  CheckCircle2,
  Zap,
  ChevronRight,
  X,
  Tag,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';
import { gatewayLogin } from '@/features/onapi/api';
import {
  fetchPlans,
  fetchSubscription,
  subscribe,
  cancelSubscription,
  type PlanInfo,
  type SubscriptionInfo,
} from '@/features/onapi/billing-api';

// ── Tier presentation ─────────────────────────────────────────

const TIER_META: Record<
  string,
  { accent: PortalAccent; icon: typeof Zap; tagline: string }
> = {
  free: {
    accent: 'green',
    icon: Shield,
    tagline: 'Get started — no credit card needed',
  },
  pro: {
    accent: 'blue',
    icon: Zap,
    tagline: 'For apps going to production',
  },
  scale: {
    accent: 'purple',
    icon: CreditCard,
    tagline: 'High-volume & mission-critical',
  },
};

function tierAccent(tier: string): PortalAccent {
  return TIER_META[tier]?.accent ?? 'slate';
}

function tierTagline(tier: string): string {
  return TIER_META[tier]?.tagline ?? '';
}

// ── Plan Card ─────────────────────────────────────────────────

function PlanCard({
  plan,
  currentTier,
  onUpgrade,
  upgrading,
}: {
  plan: PlanInfo;
  currentTier: string;
  onUpgrade: (tier: string) => void;
  upgrading: string | null;
}) {
  const isCurrent = plan.tier === currentTier;
  const isBelow = tierRank(plan.tier) <= tierRank(currentTier) && !isCurrent;
  const accent = tierAccent(plan.tier);

  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="none"
      className={
        isCurrent
          ? `border-[var(--portal-${accent}-border)] shadow-[0_0_20px_var(--portal-${accent}-shadow)]`
          : isBelow
            ? 'opacity-40'
            : ''
      }
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-1 md:px-6 md:pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3
            className="text-lg font-bold tracking-[-0.02em]"
            style={{ color: portalColors[accent] }}
          >
            {plan.name}
          </h3>
          {isCurrent && (
            <span
              className="text-[10px] font-medium uppercase tracking-[0.14em]"
              style={{ color: portalColors.green }}
            >
              Current
            </span>
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-[-0.03em]">
            {plan.tier === 'free' ? '$0' : `$${(plan.amountMinor / 100).toFixed(0)}`}
          </span>
          <span className="text-xs text-muted-foreground">
            {plan.tier === 'free' ? 'forever' : `/${plan.interval}`}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {tierTagline(plan.tier)}
        </p>
      </div>

      {/* Stats */}
      <StatStrip columns={2} className="mt-2">
        <StatStripCell
          label="Rate limit"
          value={`${plan.rateLimit.toLocaleString()} /min`}
          showDivider
        />
        <StatStripCell
          label="Aggregations"
          value={plan.tier === 'free' ? 'No' : 'Yes'}
          valueClassName={
            plan.tier !== 'free'
              ? 'portal-green-text'
              : 'text-muted-foreground'
          }
        />
      </StatStrip>

      {/* CTA */}
      <div className="px-5 pb-4 pt-3 md:px-6">
        {isCurrent ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--portal-green-border)] bg-[var(--portal-green-bg)] px-4 py-2 text-sm font-medium portal-green-text">
            <Check className="h-4 w-4" />
            Active plan
          </div>
        ) : plan.tier === 'free' ? null : (
          <Button
            onClick={() => onUpgrade(plan.tier)}
            loading={upgrading === plan.tier}
            disabled={upgrading !== null || isBelow}
            className={`portal-${accent}-surface w-full justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:brightness-110`}
            variant="ghost"
          >
            Upgrade to {plan.name}
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </SurfacePanel>
  );
}

function tierRank(tier: string): number {
  const ranks: Record<string, number> = { free: 0, pro: 1, scale: 2 };
  return ranks[tier] ?? -1;
}

// ── Free tier placeholder plan ────────────────────────────────

const FREE_PLAN: PlanInfo = {
  tier: 'free',
  name: 'Free',
  price: '$0/month',
  amountMinor: 0,
  currency: 'USD',
  interval: 'month',
  rateLimit: 60,
};

// ── Main Page ─────────────────────────────────────────────────

export default function BillingPage() {
  const { accountId, wallet, isConnected, connect } = useWallet();
  const searchParams = useSearchParams();

  // Checkout return detection
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setCheckoutSuccess(true);
      // Clean query string without page reload
      window.history.replaceState({}, '', '/onapi/billing');
    }
  }, [searchParams]);

  // Gateway JWT session
  const [jwt, setJwt] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [currentTier, setCurrentTier] = useState('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Promo code
  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState<string | null>(null);

  // Email for billing
  const [billingEmail, setBillingEmail] = useState('');

  const hasAuthed = useRef(false);

  // ── Auth ──────────────────────────────────────────────────────

  const authenticate = useCallback(async () => {
    if (!wallet || !accountId) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const token = await gatewayLogin(wallet, accountId);
      setJwt(token);
      hasAuthed.current = true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }, [wallet, accountId]);

  useEffect(() => {
    if (isConnected && wallet && accountId && !jwt && !hasAuthed.current) {
      authenticate();
    }
  }, [isConnected, wallet, accountId, jwt, authenticate]);

  // ── Fetch data ────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    setError(null);
    try {
      const [planList, subData] = await Promise.all([
        fetchPlans(jwt),
        fetchSubscription(jwt),
      ]);
      setPlans(planList);
      setSubscription(subData.subscription);
      setCurrentTier(subData.tier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    if (jwt) refresh();
  }, [jwt, refresh]);

  // ── Upgrade (redirect to Revolut checkout) ────────────────────

  const handleUpgrade = async (tier: string) => {
    if (!jwt) return;
    const email = billingEmail.trim();
    if (!email) {
      setError('Please enter your email address for billing');
      return;
    }
    setUpgrading(tier);
    setError(null);
    try {
      const result = await subscribe(jwt, tier, email, promoApplied ?? undefined);
      // Redirect to Revolut hosted checkout
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setUpgrading(null);
    }
  };

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
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setCancelling(false);
    }
  };

  // ── Apply promo ───────────────────────────────────────────────

  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoApplied(code);
    setPromoInput('');
  };

  // ── Disconnected state ────────────────────────────────────────

  if (!isConnected) {
    return (
      <PageShell className="max-w-3xl">
        <SecondaryPageHeader
          badge="Billing"
          badgeAccent="purple"
          title="Manage your subscription"
          description="Connect your NEAR wallet to view and manage your plan."
        />
        <SurfacePanel radius="xl" tone="soft" padding="roomy" className="text-center">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            Sign in with your NEAR wallet to get started.
          </p>
          <Button onClick={() => connect()} variant="default">
            Connect Wallet
          </Button>
        </SurfacePanel>
      </PageShell>
    );
  }

  // ── Authenticating state ──────────────────────────────────────

  if (!jwt) {
    return (
      <PageShell className="max-w-3xl">
        <SecondaryPageHeader
          badge="Billing"
          badgeAccent="purple"
          title="Manage your subscription"
          description="Sign a message to verify wallet ownership."
        />
        <SurfacePanel radius="xl" tone="soft" padding="roomy" className="text-center">
          {authLoading ? (
            <>
              <PulsingDots size="md" />
              <p className="mt-3 text-sm text-muted-foreground">
                Sign the message in your wallet...
              </p>
            </>
          ) : authError ? (
            <>
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 portal-amber-text" />
              <p className="mb-2 text-sm text-foreground">{authError}</p>
              <Button onClick={authenticate} variant="outline" size="sm">
                Try Again
              </Button>
            </>
          ) : (
            <>
              <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-4 text-sm text-muted-foreground">
                Verify wallet ownership to manage billing.
              </p>
              <Button onClick={authenticate} variant="default">
                Sign &amp; Verify
              </Button>
            </>
          )}
        </SurfacePanel>
      </PageShell>
    );
  }

  // ── Authenticated ─────────────────────────────────────────────

  const allPlans = [FREE_PLAN, ...plans];

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Billing"
        badgeAccent="purple"
        glowAccents={['green', 'blue', 'purple']}
        title="Manage your subscription"
        description={`Signed in as ${accountId}`}
      />

      {/* ── Current Plan Summary ──────────────────────────── */}
      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StatStrip columns={subscription ? 3 : 2}>
            <StatStripCell
              label="Current plan"
              showDivider
            >
              <PortalBadge accent={tierAccent(currentTier)} size="sm">
                {currentTier}
              </PortalBadge>
            </StatStripCell>
            <StatStripCell
              label="Status"
              showDivider={!!subscription}
            >
              {subscription ? (
                <span
                  className={
                    subscription.status === 'active'
                      ? 'portal-green-text'
                      : subscription.status === 'cancelled'
                        ? 'portal-amber-text'
                        : 'portal-red-text'
                  }
                >
                  {subscription.status === 'active'
                    ? 'Active'
                    : subscription.status === 'cancelled'
                      ? 'Cancelling'
                      : subscription.status === 'past_due'
                        ? 'Past due'
                        : 'Expired'}
                </span>
              ) : (
                <span className="text-muted-foreground">Free tier</span>
              )}
            </StatStripCell>
            {subscription && (
              <StatStripCell label="Renews">
                {subscription.status === 'cancelled' ? (
                  <span className="text-muted-foreground">
                    Expires {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                ) : (
                  new Date(subscription.currentPeriodEnd).toLocaleDateString()
                )}
              </StatStripCell>
            )}
          </StatStrip>
        </motion.div>
      )}

      {/* ── Checkout success banner ─────────────────────── */}
      {checkoutSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-lg border border-[var(--portal-green-border)] bg-[var(--portal-green-bg)] px-4 py-3"
        >
          <CheckCircle2 className="h-5 w-5 portal-green-text flex-shrink-0" />
          <p className="flex-1 text-sm portal-green-text">
            Payment complete! Your plan has been upgraded.
          </p>
          <button
            onClick={() => setCheckoutSuccess(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* ── Error banner ──────────────────────────────────── */}
      {error && (
        <div className="portal-amber-panel rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────── */}
      {loading && (
        <div className="py-12 text-center">
          <PulsingDots size="md" />
        </div>
      )}

      {/* ── Plan Cards ────────────────────────────────────── */}
      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <SectionHeader
            badge="Plans"
            badgeAccent="blue"
            align="center"
            className="mb-4"
          />

          <div className="grid gap-4 md:grid-cols-3">
            {allPlans.map((plan) => (
              <PlanCard
                key={plan.tier}
                plan={plan}
                currentTier={currentTier}
                onUpgrade={handleUpgrade}
                upgrading={upgrading}
              />
            ))}
          </div>

          {/* ── Billing email (required for new subscriptions) ── */}
          {currentTier === 'free' && (
            <div className="mx-auto mt-4 max-w-xs">
              <input
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                placeholder="Billing email address"
                className="h-9 w-full rounded-lg border border-border/40 bg-background/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--portal-purple)] focus:outline-none"
              />
            </div>
          )}

          {/* ── Promo code ──────────────────────────────────── */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {promoApplied ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--portal-green-border)] bg-[var(--portal-green-bg)] px-3 py-1.5">
                <Tag className="h-3.5 w-3.5 portal-green-text" />
                <span className="text-sm font-medium portal-green-text">
                  {promoApplied}
                </span>
                <button
                  onClick={() => setPromoApplied(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                  placeholder="Promo code"
                  maxLength={32}
                  className="h-8 w-40 rounded-lg border border-border/40 bg-background/40 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-[var(--portal-purple)] focus:outline-none"
                />
                <Button
                  onClick={handleApplyPromo}
                  variant="outline"
                  size="xs"
                  disabled={!promoInput.trim()}
                >
                  Apply
                </Button>
              </>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Paid tiers are billed monthly via Revolut. Cancel anytime.
          </p>
        </motion.div>
      )}

      {/* ── Active Subscription Management ────────────────── */}
      {!loading && subscription && subscription.status === 'active' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <SurfacePanel radius="xl" tone="soft" padding="roomy">
            <h3 className="mb-3 text-sm font-semibold">Subscription</h3>

            <div className="flex items-center gap-3">
              <PortalBadge accent={tierAccent(subscription.tier)} size="sm">
                {subscription.tier}
              </PortalBadge>
              <span className="text-sm text-muted-foreground">
                {new Date(subscription.currentPeriodStart).toLocaleDateString()}
                {' → '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
              {subscription.promotionCode && (
                <PortalBadge accent="amber" size="xs">
                  {subscription.promotionCode}
                  {subscription.promotionCyclesRemaining > 0 &&
                    ` · ${subscription.promotionCyclesRemaining} cycles left`}
                </PortalBadge>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {confirmCancel ? (
                <>
                  <p className="flex-1 text-xs text-muted-foreground">
                    Access continues until{' '}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                    Are you sure?
                  </p>
                  <Button
                    variant="destructive"
                    size="xs"
                    loading={cancelling}
                    onClick={handleCancel}
                  >
                    Confirm Cancel
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Keep Plan
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmCancel(true)}
                  className="text-muted-foreground"
                >
                  Cancel subscription
                </Button>
              )}
            </div>
          </SurfacePanel>
        </motion.div>
      )}

      {/* ── Cancelled Subscription Notice ─────────────────── */}
      {!loading && subscription && subscription.status === 'cancelled' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <SurfacePanel radius="xl" tone="soft" padding="roomy">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 portal-amber-text" />
              <div>
                <p className="text-sm font-medium">Subscription cancelled</p>
                <p className="text-xs text-muted-foreground">
                  Your {subscription.tier} access continues until{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                  After that, you&apos;ll return to the free tier.
                </p>
              </div>
            </div>
          </SurfacePanel>
        </motion.div>
      )}

      {/* ── Past Due Notice ───────────────────────────────── */}
      {!loading && subscription && subscription.status === 'past_due' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <SurfacePanel
            radius="xl"
            tone="soft"
            padding="roomy"
            className="border-[var(--portal-red-border)]"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 portal-red-text" />
              <div>
                <p className="text-sm font-medium portal-red-text">Payment failed</p>
                <p className="text-xs text-muted-foreground">
                  Your last payment didn&apos;t go through. Please update your payment
                  method by subscribing again, or your plan will expire.
                </p>
              </div>
            </div>
          </SurfacePanel>
        </motion.div>
      )}
    </PageShell>
  );
}
