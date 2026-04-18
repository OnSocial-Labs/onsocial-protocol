'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Copy,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Key,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  X,
  ArrowUpRight,
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
import { TransactionFeedbackToast, type TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { portalColors, portalFrameBorders, portalFrameBackgrounds, type PortalAccent } from '@/lib/portal-colors';
import { fadeUpMotion, scaleFadeMotion, fadeMotion } from '@/lib/motion';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  getUsage,
  type ApiKeyInfo,
  type CreateKeyResult,
  type UsageSummary,
} from '@/features/onapi/api';
import {
  fetchPlansPublic,
  fetchSubscription,
  subscribe,
  cancelSubscription,
  completeDevSubscription,
  type PlanInfo,
  type SubscriptionInfo,
} from '@/features/onapi/billing-api';
import { ACTIVE_API_URL } from '@/lib/portal-config';

function maskKey(prefix: string): string {
  return `${prefix}${'•'.repeat(20)}`;
}

function formatTierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

const TIER_ACCENT: Record<string, PortalAccent> = {
  free: 'green',
  pro: 'blue',
  scale: 'purple',
  service: 'amber',
};

const TIER_LIMITS: Record<string, string> = {
  free: '60 /min',
  pro: '600 /min',
  scale: '3,000 /min',
  service: '10,000 /min',
};

/** Daily request budget estimate (rate-limit × 1440 minutes). */
const TIER_DAILY_BUDGET: Record<string, number> = {
  free: 86_400,
  pro: 864_000,
  scale: 4_320_000,
  service: 14_400_000,
};

/** Static tier specs matching the landing-page cards. */
const TIER_SPECS: Record<string, { depth: string; complexity: string; rows: string; aggregations: boolean }> = {
  free:  { depth: '3',  complexity: '50',    rows: '100',    aggregations: false },
  pro:   { depth: '8',  complexity: '1,000', rows: '10,000', aggregations: true },
  scale: { depth: '12', complexity: '5,000', rows: '50,000', aggregations: true },
};

function nextTierUp(tier: string): string | null {
  const order = ['free', 'pro', 'scale'];
  const idx = order.indexOf(tier);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}

function tierAccent(tier: string): PortalAccent {
  return TIER_ACCENT[tier] ?? 'slate';
}

function tierRank(tier: string): number {
  const ranks: Record<string, number> = { free: 0, pro: 1, scale: 2, service: 3 };
  return ranks[tier] ?? -1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Copy"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 portal-green-text" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export default function OnApiKeysPage() {
  const { accountId, isConnected, isLoading: walletLoading, connect } = useWallet();
  const {
    jwt,
    isAuthenticating: authLoading,
    authError,
    ensureAuth,
    clearAuth,
  } = useGatewayAuth();
  const { setNavBack } = useMobilePageContext();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setNavBack({ label: 'Back' });
    return () => setNavBack(null);
  }, [setNavBack]);

  const requestedTier = searchParams.get('tier');

  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [isAdmin, setIsAdmin] = useState(false);

  const [billingEmail, setBillingEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [completingDev, setCompletingDev] = useState(false);
  const pendingUpgradeRef = useRef(false);

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setToast({ type: 'success', msg: 'Payment complete \u2014 your plan is active!' });
      window.history.replaceState({}, '', '/onapi/keys');
    }
  }, [searchParams]);

  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);

  const [newKey, setNewKey] = useState<CreateKeyResult | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [label, setLabel] = useState('');

  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const [rotating, setRotating] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<TransactionFeedback | null>(null);
  const lastAuthError = useRef(authError);

  /** Map raw SDK/API errors to human-friendly messages. */
  function friendlyError(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes('closed the window') || lower.includes('wallet closed') || lower.includes('user rejected') || lower.includes('cancelled') || lower.includes('canceled'))
      return 'Wallet confirmation cancelled';
    if (lower.includes('permission denied'))
      return 'Wallet permission denied';
    if (lower.includes('timeout') || lower.includes('timed out'))
      return 'Wallet request timed out';
    if (lower.includes('authentication') || lower.includes('unauthorized'))
      return 'Session expired — sign in again';
    if (lower.includes('network') || lower.includes('fetch'))
      return 'Network error — check your connection';
    return raw;
  }

  // Surface only NEW auth errors as toasts (skip stale errors from previous navigation)
  useEffect(() => {
    if (authError && authError !== lastAuthError.current) {
      setToast({ type: 'error', msg: friendlyError(authError) });
    }
    lastAuthError.current = authError;
  }, [authError]);

  useEffect(() => {
    if (error) {
      setToast({ type: 'error', msg: friendlyError(error) });
    }
  }, [error]);

  const refresh = useCallback(async () => {
    if (!jwt) return;
    setKeysLoading(true);
    setError(null);
    try {
      const [keyList, usageData, subData] = await Promise.all([
        listApiKeys(jwt),
        getUsage(jwt).catch(() => null),
        fetchSubscription(jwt).catch(
          () => ({ subscription: null, tier: 'free' as string, admin: false }),
        ),
      ]);
      setKeys(keyList);
      setUsage(usageData);
      setSubscription(subData.subscription);
      setCurrentTier(subData.tier);
      setIsAdmin(!!subData.admin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load keys';
      if (msg.includes('Authentication')) {
        try {
          const token = await ensureAuth();
          if (token) {
            const [keyList, usageData, subData] = await Promise.all([
              listApiKeys(token),
              getUsage(token).catch(() => null),
              fetchSubscription(token).catch(
                () => ({ subscription: null, tier: 'free' as string, admin: false }),
              ),
            ]);
            setKeys(keyList);
            setUsage(usageData);
            setSubscription(subData.subscription);
            setCurrentTier(subData.tier);
            setIsAdmin(!!subData.admin);
            return;
          }
        } catch {
        }
        clearAuth();
        return;
      }
      setError(msg);
    } finally {
      setKeysLoading(false);
    }
  }, [jwt, ensureAuth, clearAuth]);

  useEffect(() => {
    if (!jwt || !accountId || !isConnected) {
      setKeys([]);
      setUsage(null);
      setNewKey(null);
      setShowNewKey(false);
      setError(null);
      setSubscription(null);
      setCurrentTier('free');
      setIsAdmin(false);
      return;
    }

    void refresh();
  }, [jwt, accountId, isConnected, refresh]);

  useEffect(() => {
    fetchPlansPublic().then((planList) => {
      if (planList.length > 0) setPlans(planList);
    });
  }, []);

  const targetPlan = requestedTier
    ? plans.find((plan) => plan.tier === requestedTier) ?? null
    : null;
  const accent: PortalAccent = targetPlan ? tierAccent(targetPlan.tier) : requestedTier ? tierAccent(requestedTier) : 'blue';
  // past_due subscriptions are effectively free for checkout decisions
  const effectiveTier = subscription?.status === 'past_due' ? 'free' : currentTier;
  const isServiceTier = effectiveTier === 'service';
  const alreadyOnTier = requestedTier ? effectiveTier === requestedTier : false;
  const isUpgrade = requestedTier
    ? !isServiceTier && tierRank(requestedTier) > tierRank(effectiveTier)
    : false;
  const isDowngrade = requestedTier
    ? !isServiceTier && tierRank(requestedTier) < tierRank(effectiveTier) && !alreadyOnTier
    : false;
  const requiresCancelFirst = false; // gateway handles cancel+re-create in one action
  const hasKeys = keys.length > 0;
  const showUpgradePanel = Boolean(
    targetPlan && !alreadyOnTier && (isUpgrade || isDowngrade || effectiveTier === 'free'),
  );
  const showDevBillingBypass =
    ACTIVE_API_URL.includes('localhost') && subscription?.status === 'pending';
  const quickStartExpanded = !hasKeys || quickStartOpen;
  const emailValid = EMAIL_RE.test(billingEmail.trim());
  const showEmailHint =
    emailTouched && billingEmail.trim().length > 0 && !emailValid;

  const executeUpgrade = useCallback(async () => {
    if (!emailValid || !requestedTier) return;
    setUpgrading(true);
    setError(null);
    try {
      const token = await ensureAuth();
      if (!token) {
        setUpgrading(false);
        return;
      }
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
      void executeUpgrade();
    }
  }, [isConnected, accountId, executeUpgrade]);

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

  const handleDevComplete = async () => {
    if (!jwt) return;
    setCompletingDev(true);
    setError(null);
    try {
      await completeDevSubscription(jwt);
      await refresh();
      setToast({ type: 'success', msg: 'Payment complete \u2014 your plan is active!' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete sandbox payment');
    } finally {
      setCompletingDev(false);
    }
  };

  const handleCreate = async () => {
    if (!jwt) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createApiKey(jwt, label.trim());
      setNewKey(result);
      setShowNewKey(true);
      setLabel('');
      setShowCreateForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (prefix: string) => {
    if (!jwt) return;
    setRevoking(prefix);
    setError(null);
    try {
      await revokeApiKey(jwt, prefix);
      setConfirmRevoke(null);
      if (newKey?.prefix === prefix) setNewKey(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setRevoking(null);
    }
  };

  const handleRotate = async (prefix: string) => {
    if (!jwt) return;
    setRotating(prefix);
    setError(null);
    try {
      const result = await rotateApiKey(jwt, prefix);
      setNewKey(result);
      setShowNewKey(true);
      setConfirmRotate(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate key');
    } finally {
      setRotating(null);
    }
  };

  if (!jwt) {
    return (
      <PageShell className="max-w-3xl space-y-6">
        <SecondaryPageHeader badge="API Keys" badgeAccent="purple" />
        <SurfacePanel radius="xl" tone="soft" padding="roomy" className="text-center">
          {!isConnected ? (
            <>
              <Key className="mx-auto mb-3 h-6 w-6 text-muted-foreground/40" />
              <p className="mb-4 text-sm font-medium text-foreground">
                Connect to manage your API access
              </p>
              <Button onClick={connect} variant="default" size="sm" loading={walletLoading}>
                Sign in
              </Button>
            </>
          ) : (
            <>
              <Key className="mx-auto mb-3 h-6 w-6 text-muted-foreground/40" />
              <p className="mb-1 text-sm font-medium text-foreground">
                One more step
              </p>
              <p className="mb-4 text-[11px] text-muted-foreground">
                Sign a message to open your session — no gas, no transaction.
              </p>
              <Button onClick={ensureAuth} variant="default" size="sm" loading={authLoading}>
                Authorize
              </Button>
            </>
          )}
        </SurfacePanel>

        <TransactionFeedbackToast result={toast} onClose={() => setToast(null)} />
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-3xl space-y-6">
      <SecondaryPageHeader badge="API Keys" badgeAccent="purple" />

      {showDevBillingBypass && (
        <SurfacePanel radius="xl" tone="soft" padding="roomy" className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Local sandbox bypass
            </p>
            <p className="text-xs text-muted-foreground">
              Revolut sandbox checkout is still pending. For local testing, mark it complete here and continue with the API key flow.
            </p>
          </div>
          <Button onClick={handleDevComplete} size="sm" loading={completingDev}>
            Mark sandbox payment complete
          </Button>
        </SurfacePanel>
      )}

      {/* ── Plan card: always visible for authenticated users ── */}
      <motion.div
        {...fadeUpMotion(!!reduceMotion, { distance: 12, delay: 0.12 })}
      >
          {/* ── Upgrade / downgrade flow: minimal current-plan line ── */}
          {showUpgradePanel || requiresCancelFirst ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: portalColors[tierAccent(currentTier)] }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: portalColors[tierAccent(currentTier)] }}
                >
                  {formatTierLabel(currentTier)}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Current plan</span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                  {(usage?.today ?? 0).toLocaleString()} today · {(usage?.thisMonth ?? 0).toLocaleString()} /mo
                </span>
              </div>
              {(() => {
                const budget = TIER_DAILY_BUDGET[currentTier] ?? 86_400;
                const todayCount = usage?.today ?? 0;
                const pct = budget > 0 ? todayCount / budget : 0;
                const pctClamped = Math.min(pct, 1);
                return (
                  <div className="h-px w-full bg-border/40">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pctClamped * 100, 1)}%`,
                        backgroundColor: 'var(--muted-foreground)',
                        opacity: 0.3,
                      }}
                    />
                  </div>
                );
              })()}
            </div>
          ) : (
          /* ── Dashboard: full plan card ── */
          <SurfacePanel
            radius="xl"
            tone="soft"
            padding="roomy"
            className="transition-[border-color,box-shadow] duration-200"
            style={{
              borderColor: `color-mix(in srgb, ${portalColors[tierAccent(currentTier)]} 25%, transparent)`,
              boxShadow: `0 0 24px color-mix(in srgb, ${portalColors[tierAccent(currentTier)]} 8%, transparent)`,
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: portalColors[tierAccent(currentTier)] }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: portalColors[tierAccent(currentTier)] }}
                >
                  {formatTierLabel(currentTier)}
                </span>
              </span>
              {isAdmin && (
                <PortalBadge accent="amber" size="xs">Admin</PortalBadge>
              )}
              {subscription && !['expired', 'pending'].includes(subscription.status) && (
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {subscription.status === 'active'
                    ? 'Active'
                    : subscription.status === 'cancelled'
                      ? 'Cancelling'
                      : 'Past due'}
                </span>
              )}
              {subscription?.promotionCode && (
                <PortalBadge accent="amber" size="xs">
                  {subscription.promotionCode}
                  {subscription.promotionCyclesRemaining > 0
                    ? ` · ${subscription.promotionCyclesRemaining} left`
                    : ''}
                </PortalBadge>
              )}
              {subscription?.status === 'active' && subscription.currentPeriodEnd && (
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/50">
                  Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* ── Stats row (always shown) ── */}
            <div className="mt-3">
              <StatStrip columns={3}>
                <StatStripCell label="Rate limit" showDivider>
                  <span className="font-mono text-sm font-semibold tracking-tight" style={{ color: portalColors[tierAccent(currentTier)] }}>
                    {TIER_LIMITS[currentTier] ?? '60 /min'}
                  </span>
                </StatStripCell>
                <StatStripCell label="Reqs today" showDivider>
                  <span className="font-mono text-sm font-semibold tracking-tight portal-blue-text">
                    {(usage?.today ?? 0).toLocaleString()}
                  </span>
                </StatStripCell>
                <StatStripCell label="Reqs this month">
                  <span className="font-mono text-sm font-semibold tracking-tight portal-slate-text">
                    {(usage?.thisMonth ?? 0).toLocaleString()}
                  </span>
                </StatStripCell>
              </StatStrip>
            </div>

            {/* ── Usage bar (thin, directly under stats) ── */}
            {!isAdmin && subscription?.status !== 'cancelled' && (() => {
              const budget = TIER_DAILY_BUDGET[currentTier] ?? 86_400;
              const todayCount = usage?.today ?? 0;
              const pct = budget > 0 ? todayCount / budget : 0;
              const pctClamped = Math.min(pct, 1);
              const next = nextTierUp(currentTier);
              const nextAccent = next ? tierAccent(next) : tierAccent(currentTier);
              const showNudge = next && pct >= 0.8;
              return (
                <div className="mt-0">
                  <div className="h-px w-full bg-border/40">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pctClamped * 100, 1)}%`,
                        backgroundColor: showNudge ? portalColors[nextAccent] : 'var(--muted-foreground)',
                        opacity: showNudge ? 1 : 0.3,
                      }}
                    />
                  </div>
                  {showNudge && next && (
                    <div className="flex items-center justify-between pt-1.5">
                      <span className="text-[10px] text-muted-foreground/60">
                        {pct >= 1 ? 'Daily limit reached' : 'Nearing daily limit'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {subscription?.status === 'active' && (
              <div className="mt-3">
                {confirmCancel ? (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs text-muted-foreground">
                      You&apos;ll keep access until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. Sure?
                    </p>
                    <Button
                      variant="destructive"
                      size="xs"
                      loading={cancelling}
                      onClick={handleCancel}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setConfirmCancel(false)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setConfirmCancel(true)}
                    className="text-muted-foreground"
                  >
                    Cancel renewal
                  </Button>
                )}
              </div>
            )}

            {subscription?.status === 'cancelled' && (() => {
              const start = new Date(subscription.currentPeriodStart).getTime();
              const end = new Date(subscription.currentPeriodEnd).getTime();
              const now = Date.now();
              const total = end - start;
              const elapsed = Math.max(0, now - start);
              const pct = total > 0 ? Math.min(elapsed / total, 1) : 0;
              const accentColor = portalColors[tierAccent(currentTier)];
              const nearEnd = pct >= 0.75;
              return (
                <div className="mt-3">
                  <div className="h-px w-full bg-border/40">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pct * 100, 1)}%`,
                        backgroundColor: nearEnd ? accentColor : 'var(--muted-foreground)',
                        opacity: nearEnd ? 0.7 : 0.3,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground/70">
                      {formatTierLabel(subscription.tier)} until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                    <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground/50">
                      then Free
                    </span>
                  </div>
                </div>
              );
            })()}

            {subscription?.status === 'past_due' && (
              <p className="mt-3 text-xs portal-red-text">
                Payment didn&apos;t go through — resubscribe to keep your plan.
              </p>
            )}

            {subscription?.graceTier && subscription.gracePeriodEnd && new Date(subscription.gracePeriodEnd) > new Date() && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground/70">
                  {formatTierLabel(subscription.graceTier)} limits until {new Date(subscription.gracePeriodEnd).toLocaleDateString()}
                </span>
                <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground/50">
                  then {formatTierLabel(subscription.tier)}
                </span>
              </div>
            )}

            {/* ── Subtle inline upgrade options ── */}
            {!requestedTier && !isAdmin && subscription?.status !== 'past_due' && (() => {
              const upgrades = (['pro', 'scale'] as const).filter(
                (t) => tierRank(t) > tierRank(currentTier)
              );
              if (upgrades.length === 0) return null;
              return (
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/20" />
                  {upgrades.map((t) => (
                    <a
                      key={t}
                      href={`/onapi/keys?tier=${t}`}
                      className="group/chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.04em] transition-all duration-150 hover:shadow-sm"
                      style={{
                        color: portalColors[tierAccent(t)],
                        backgroundColor: `color-mix(in srgb, ${portalColors[tierAccent(t)]} 8%, transparent)`,
                        borderWidth: 1,
                        borderColor: `color-mix(in srgb, ${portalColors[tierAccent(t)]} 15%, transparent)`,
                      }}
                    >
                      {formatTierLabel(t)}
                      <span className="text-[10px] font-normal opacity-60">{TIER_LIMITS[t]}</span>
                      <ArrowUpRight className="h-2.5 w-2.5 opacity-40 transition-all duration-150 group-hover/chip:opacity-100 group-hover/chip:translate-x-0.5 group-hover/chip:-translate-y-0.5" />
                    </a>
                  ))}
                </div>
              );
            })()}
          </SurfacePanel>
          )}
        </motion.div>

      {showUpgradePanel && targetPlan && (() => {
              const specs = TIER_SPECS[targetPlan.tier] ?? TIER_SPECS.pro;
              return (
              <motion.div {...fadeUpMotion(!!reduceMotion, { distance: 16, duration: 0.3 })}>
              <SurfacePanel
                radius="xl"
                tone="soft"
                padding="none"
                className="overflow-hidden transition-[border-color,box-shadow] duration-200"
                style={{
                  borderColor: `color-mix(in srgb, ${portalColors[accent]} 30%, transparent)`,
                  boxShadow: `0 0 20px color-mix(in srgb, ${portalColors[accent]} 12%, transparent)`,
                }}
              >
                {/* ── Card header: tier name + price ── */}
                <div className="px-5 pt-5 pb-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      className="text-lg font-bold tracking-[-0.02em]"
                      style={{ color: portalColors[accent] }}
                    >
                      {targetPlan.name}
                    </h3>
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {isDowngrade ? 'Downgrade' : 'Upgrade'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    {targetPlan.promotion ? (
                      <>
                        <span className="text-lg font-medium text-muted-foreground line-through">
                          ${(targetPlan.amountMinor / 100).toFixed(0)}
                        </span>
                        <span className="text-2xl font-bold tracking-[-0.03em]">
                          {targetPlan.promotion.discountedPrice}
                        </span>
                        <span className="text-xs text-muted-foreground">/{targetPlan.interval}</span>
                        <span className="ml-2 text-xs font-medium" style={{ color: portalColors[accent] }}>
                          {targetPlan.promotion.discountPercent}% off
                          {targetPlan.promotion.durationCycles > 0
                            ? ` for ${targetPlan.promotion.durationCycles} mo`
                            : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl font-bold tracking-[-0.03em]">
                          ${(targetPlan.amountMinor / 100).toFixed(0)}
                        </span>
                        <span className="text-xs text-muted-foreground">/{targetPlan.interval}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Key specs (checkout-focused) ── */}
                <StatStrip columns={2} className="mt-2">
                  <StatStripCell label="Requests" value={`${targetPlan.rateLimit.toLocaleString()} /min`} showDivider />
                  <StatStripCell
                    label="Analytics"
                    value={specs.aggregations ? 'Custom' : 'Prebuilt'}
                    valueClassName={specs.aggregations ? 'portal-green-text' : 'text-muted-foreground'}
                  />
                </StatStrip>

                {/* ── Email + checkout ── */}
                <div className="space-y-2.5 px-5 pt-3 pb-5">
                  <div>
                    <SurfacePanel
                      radius="md"
                      tone="inset"
                      borderTone="subtle"
                      padding="none"
                      className={`flex items-center gap-3 px-3 py-2.5 transition-[border-color] duration-150 ease focus-within:border-[var(--_focus-accent)] ${showEmailHint ? 'border-amber-500/40' : ''}`}
                      style={{
                        '--_focus-accent': showEmailHint
                          ? 'color-mix(in srgb, var(--portal-amber) 50%, transparent)'
                          : `color-mix(in srgb, ${portalColors[accent]} 50%, transparent)`,
                      } as CSSProperties}
                    >
                      <input
                        id="billing-email"
                        type="email"
                        value={billingEmail}
                        onChange={(e) => {
                          setBillingEmail(e.target.value);
                          setEmailTouched(false);
                        }}
                        onBlur={() => setEmailTouched(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="Billing email"
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium tracking-[-0.01em] outline-none placeholder:text-muted-foreground/50"
                      />
                    </SurfacePanel>
                    <p className="mt-1 px-0.5 text-[10px] tracking-[0.02em] text-muted-foreground/40">
                      For receipts and payment updates
                    </p>
                  </div>
                  <Button
                    onClick={handleSubscribe}
                    loading={upgrading}
                    disabled={upgrading || !emailValid}
                    variant={accent === 'purple' ? 'secondary' : 'default'}
                    className="w-full justify-center"
                    size="cta"
                  >
                    {isDowngrade ? 'Switch to' : 'Upgrade to'} {targetPlan.name}
                  </Button>
                  <p className="text-center text-[10px] tracking-[0.04em] text-muted-foreground/50">
                    Powered by Revolut Pay
                  </p>
                </div>
              </SurfacePanel>
              </motion.div>
              );
            })()}

            {requestedTier && requiresCancelFirst && (
              <motion.div {...fadeUpMotion(!!reduceMotion, { distance: 16, duration: 0.3 })}>
              <SurfacePanel
                radius="xl"
                tone="soft"
                padding="roomy"
                className="transition-[border-color,box-shadow] duration-200"
                style={{
                  borderColor: `color-mix(in srgb, ${portalColors[accent]} 20%, transparent)`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: portalColors[accent] }}
                  />
                  <span
                    className="text-xs font-semibold uppercase tracking-[0.18em]"
                    style={{ color: portalColors[accent] }}
                  >
                    {formatTierLabel(requestedTier)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {requestedTier === 'free'
                    ? (subscription?.status === 'cancelled'
                      ? <>Your {formatTierLabel(currentTier)} access runs until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. You&apos;ll switch to Free automatically after that.</>
                      : <>Cancel your {formatTierLabel(currentTier)} renewal and you&apos;ll switch to Free automatically when the period ends.</>)
                    : (subscription?.status === 'cancelled'
                      ? <>Your {formatTierLabel(currentTier)} plan runs until {new Date(subscription.currentPeriodEnd).toLocaleDateString()} — you can buy {formatTierLabel(requestedTier)} after it expires.</>
                      : <>Cancel your {formatTierLabel(currentTier)} renewal first. You&apos;ll keep access until the period ends, then you can switch to {formatTierLabel(requestedTier)}.</>)}
                </p>
              </SurfacePanel>
              </motion.div>
            )}

            {requestedTier && alreadyOnTier && targetPlan && (
              <p className="text-sm text-muted-foreground">
                You&apos;re already on the{' '}
                <span style={{ color: portalColors[accent] }} className="font-medium">
                  {targetPlan?.name}
                </span>{' '}
                plan.
              </p>
            )}

      {newKey && (
        <motion.div
          {...fadeUpMotion(!!reduceMotion, { distance: 12, delay: 0.18 })}
        >
          <SurfacePanel
            radius="xl"
            tone="soft"
            padding="roomy"
            className="border-[var(--portal-green-border)] shadow-[0_0_20px_var(--portal-green-shadow)]"
          >
            <div className="mb-2 flex items-center gap-2">
              <Key className="h-4 w-4 portal-green-text" />
              <span className="text-sm font-semibold">Your new key</span>
            </div>

            <p className="mb-3 flex items-center gap-1.5 text-xs portal-amber-text">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Copy it now — it won&apos;t be shown again.
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs">
                {showNewKey ? newKey.key : maskKey(newKey.prefix)}
              </code>
              <button
                onClick={() => setShowNewKey((visible) => !visible)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showNewKey ? 'Hide key' : 'Reveal key'}
              >
                {showNewKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
              <CopyInline text={newKey.key} />
            </div>

            <p className="mt-2 text-[10px] text-muted-foreground">
              Label: {newKey.label} · Prefix: {newKey.prefix}
            </p>
          </SurfacePanel>
        </motion.div>
      )}

      {!showUpgradePanel && (
      <AnimatePresence mode="wait">
        {showCreateForm ? (
          <motion.div
            key="create-form"
            {...scaleFadeMotion(!!reduceMotion)}
          >
            <SurfacePanel radius="xl" tone="soft" padding="roomy">
              <h3 className="mb-3 text-sm font-semibold">New key</h3>
              <div className="flex gap-2 items-center">
                <SurfacePanel
                  radius="md"
                  tone="inset"
                  borderTone="subtle"
                  padding="none"
                  className="flex flex-1 items-center px-3 py-1.5 transition-[border-color] duration-150 ease focus-within:border-[color-mix(in_srgb,var(--portal-blue)_50%,transparent)]"
                >
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && label.trim() && !creating) {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                    placeholder="Label"
                    maxLength={64}
                    required
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium tracking-[-0.01em] outline-none placeholder:text-muted-foreground/50"
                  />
                </SurfacePanel>
                <Button
                  onClick={handleCreate}
                  loading={creating}
                  disabled={creating || !label.trim()}
                  size="xs"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Create
                </Button>
                <Button
                  onClick={() => {
                    setShowCreateForm(false);
                    setLabel('');
                  }}
                  variant="ghost"
                  size="xs"
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </SurfacePanel>
          </motion.div>
        ) : hasKeys ? (
          <motion.div
            key="create-spacer"
            {...fadeMotion()}
          />
        ) : null}
      </AnimatePresence>
      )}

      <motion.div {...fadeUpMotion(!!reduceMotion, { distance: 12, delay: 0.24 })}>
      {showUpgradePanel ? (
        /* ── Upgrade flow: hide keys + integration to keep focus on checkout ── */
        null
      ) : (
      /* ── Dashboard: full CRUD keys section ── */
      <SurfacePanel radius="xl" tone="soft" padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 md:px-5">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{hasKeys ? 'Your keys' : 'Get started'}</h3>
          <div className="flex items-center gap-2">
            {hasKeys && !showCreateForm && (
              <Button
                onClick={() => setShowCreateForm(true)}
                disabled={keys.length >= 10}
                variant="outline"
                size="xs"
              >
                <Plus className="h-3.5 w-3.5" />
                New key
              </Button>
            )}
            {hasKeys && (
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              disabled={keysLoading}
              aria-label="Refresh keys"
              className="h-7 w-7 md:h-7 md:w-7 border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${keysLoading ? 'animate-spin' : ''}`} />
            </Button>
            )}
          </div>
        </div>

        {keys.length === 0 ? (
          <div className="px-4 pb-5 pt-2 md:px-5">
            {keysLoading ? (
              <div className="py-4 text-center"><PulsingDots size="md" /></div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <SurfacePanel
                    radius="md"
                    tone="inset"
                    borderTone="subtle"
                    padding="none"
                    className="flex flex-1 items-center px-3 py-1.5 transition-[border-color] duration-150 ease focus-within:border-[color-mix(in_srgb,var(--portal-blue)_50%,transparent)]"
                  >
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && label.trim() && !creating) {
                          e.preventDefault();
                          handleCreate();
                        }
                      }}
                      placeholder="Name your first key"
                      maxLength={64}
                      required
                      autoFocus
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium tracking-[-0.01em] outline-none placeholder:text-muted-foreground/50"
                    />
                  </SurfacePanel>
                  <Button
                    onClick={handleCreate}
                    loading={creating}
                    disabled={creating || !label.trim()}
                    size="xs"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Create
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/50 text-center">Name it anything — e.g. &ldquo;production&rdquo; or &ldquo;dev&rdquo;</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {keys.map((keyInfo, i) => (
              <div key={keyInfo.prefix}>
                {i > 0 && <div className="h-px divider-detail mx-3 md:mx-4" />}
                <div
                  className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-background/40 md:px-4"
                >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: portalFrameBorders[tierAccent(currentTier)],
                    backgroundColor: portalFrameBackgrounds[tierAccent(currentTier)],
                  }}
                >
                  <Key className="h-3 w-3" style={{ color: portalColors[tierAccent(currentTier)] }} />
                </div>
                <div className="min-w-0 flex-1">
                  <code className="block truncate font-mono text-xs text-foreground">
                    {maskKey(keyInfo.prefix)}
                  </code>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {keyInfo.label}
                  </p>
                </div>

                {confirmRevoke === keyInfo.prefix ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="destructive"
                      size="xs"
                      loading={revoking === keyInfo.prefix}
                      onClick={() => handleRevoke(keyInfo.prefix)}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setConfirmRevoke(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : confirmRotate === keyInfo.prefix ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="default"
                      size="xs"
                      loading={rotating === keyInfo.prefix}
                      onClick={() => handleRotate(keyInfo.prefix)}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setConfirmRotate(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setConfirmRevoke(null);
                        setConfirmRotate(keyInfo.prefix);
                      }}
                      aria-label={`Rotate key ${keyInfo.prefix}`}
                      className="h-7 w-7 md:h-7 md:w-7 border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setConfirmRotate(null);
                        setConfirmRevoke(keyInfo.prefix);
                      }}
                      aria-label={`Revoke key ${keyInfo.prefix}`}
                      className="h-7 w-7 md:h-7 md:w-7 border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              </div>
            ))}
          </div>
        )}
      </SurfacePanel>
      )}
      </motion.div>

      {hasKeys && !showUpgradePanel && (
      <motion.div {...fadeUpMotion(!!reduceMotion, { distance: 12, delay: 0.30 })}>
      <SurfacePanel radius="xl" tone="soft" padding="none" className="overflow-hidden">
        <button
          onClick={() => setQuickStartOpen((open) => !open)}
          className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          aria-expanded={quickStartExpanded}
        >
          <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Integration</h3>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground/80 ${quickStartExpanded ? 'rotate-180' : ''}`}
            />
        </button>
        <AnimatePresence initial={false}>
          {quickStartExpanded && (
            <motion.div
              key="quick-start"
              {...fadeMotion(0.2)}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="h-px divider-section" />
              <div className="space-y-3 px-5 pb-5 pt-4 text-xs text-muted-foreground">
                <pre className="overflow-x-auto rounded-lg border border-border/30 bg-background/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
{`import { OnSocial } from '@onsocial/sdk';
const os = new OnSocial({ apiKey: 'onsocial_...' });`}
                </pre>
                <StatStrip columns={2}>
                  <StatStripCell label="Capabilities" showDivider>
                    <span className="text-xs text-foreground">Graph · Relay · Compose · Storage</span>
                  </StatStripCell>
                  <StatStripCell label="Tables">
                    <span className="font-mono text-[11px] text-foreground">data · groups · tokens · boost</span>
                  </StatStripCell>
                </StatStrip>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SurfacePanel>
      </motion.div>
      )}
      <TransactionFeedbackToast result={toast} onClose={() => setToast(null)} />
    </PageShell>
  );
}
