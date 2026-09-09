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
import { BillingPanelSkeleton } from '@/components/ui/skeleton';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';
import { fadeUpMotion } from '@/lib/motion';
import {
  fetchPlans,
  fetchPlansPublic,
  fetchSubscription,
  fetchInvoices,
  downloadInvoicePdf,
  subscribe,
  cancelSubscription,
  type PlanInfo,
  type SubscriptionInfo,
  type InvoiceInfo,
} from '@/features/onapi/billing-api';
import { BILLING_COUNTRY_SELECT_OPTIONS } from '@/features/onapi/billing-countries';
import {
  countryNeedsPostal,
  countryNeedsRegion,
  postalCodePlaceholder,
  regionSelectOptions,
} from '@/features/onapi/billing-regions';
import {
  BillingTaxPreviewPanel,
  useBillingTaxPreview,
} from '@/features/onapi/billing-tax-preview';
import { PortalFieldSelect } from '@/components/ui/portal-field-select';

// ── Tier presentation ─────────────────────────────────────────

const TIER_ACCENT: Record<string, PortalAccent> = {
  free: 'green',
  pro: 'blue',
  scale: 'purple',
};

function tierAccent(tier: string): PortalAccent {
  return TIER_ACCENT[tier] ?? 'neutral';
}

function tierRank(tier: string): number {
  const ranks: Record<string, number> = { free: 0, pro: 1, scale: 2 };
  return ranks[tier] ?? -1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Main Page ─────────────────────────────────────────────────

export default function BillingPage() {
  const { accountId, isConnected, connect } = useWallet();
  const {
    jwt,
    isAuthenticating: authLoading,
    authError,
    ensureAuth,
  } = useGatewayAuth();
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
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions
  const [upgrading, setUpgrading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [billingCountry, setBillingCountry] = useState('GB');
  const [billingRegion, setBillingRegion] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [billingLine1, setBillingLine1] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingCompanyName, setBillingCompanyName] = useState('');
  const [billingVatId, setBillingVatId] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceInfo[]>([]);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<
    string | null
  >(null);
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
      const [planList, subData, invoiceList] = await Promise.all([
        fetchPlans(jwt),
        fetchSubscription(jwt).catch(() => ({
          subscription: null,
          tier: 'free' as string,
        })),
        fetchInvoices(jwt).catch(() => [] as InvoiceInfo[]),
      ]);
      setPlans(planList);
      setSubscription(subData.subscription);
      setCurrentTier(subData.tier);
      setInvoices(invoiceList);
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
  const needsRegion = countryNeedsRegion(billingCountry);
  const needsPostal = countryNeedsPostal(billingCountry);
  const billingReady =
    emailValid &&
    Boolean(billingCountry) &&
    (!needsRegion || Boolean(billingRegion)) &&
    (!needsPostal || Boolean(billingPostalCode.trim()));
  const showEmailHint =
    emailTouched && billingEmail.trim().length > 0 && !emailValid;

  const taxPreview = useBillingTaxPreview({
    jwt,
    tier: targetPlan?.tier,
    country: billingCountry,
    region: billingRegion,
    postalCode: billingPostalCode,
    line1: billingLine1,
    city: billingCity,
    companyName: billingCompanyName,
    vatId: billingVatId,
    enabled: Boolean(targetPlan) && !alreadyOnTier && !requiresCancelFirst,
  });

  // ── Subscribe ─────────────────────────────────────────────────

  const executeUpgrade = useCallback(async () => {
    if (!billingReady) return;
    setUpgrading(true);
    setError(null);
    try {
      const token = await ensureAuth();
      if (!token) {
        setUpgrading(false);
        return;
      }
      const result = await subscribe(token, requestedTier, {
        email: billingEmail.trim(),
        country: billingCountry,
        region: billingRegion,
        postalCode: billingPostalCode,
        line1: billingLine1,
        city: billingCity,
        companyName: billingCompanyName,
        vatId: billingVatId,
      });
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setUpgrading(false);
    }
  }, [
    ensureAuth,
    billingEmail,
    billingCountry,
    billingRegion,
    billingPostalCode,
    billingLine1,
    billingCity,
    billingCompanyName,
    billingVatId,
    requestedTier,
    billingReady,
  ]);

  const handleSubscribe = async () => {
    if (!billingReady) return;
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

  const handleDownloadInvoice = async (invoice: InvoiceInfo) => {
    setError(null);
    setDownloadingInvoiceId(invoice.id);
    try {
      const token = jwt ?? (await ensureAuth());
      if (!token) return;
      await downloadInvoicePdf(
        token,
        invoice.id,
        `${invoice.invoiceNumber}.pdf`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to download invoice'
      );
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <PageShell className="max-w-xl space-y-6">
      <SecondaryPageHeader badge="Billing" badgeAccent="purple" />

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
          <Button onClick={ensureAuth} variant="outline" size="xs">
            Retry
          </Button>
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
            <button
              onClick={() => setCheckoutSuccess(false)}
              className="text-muted-foreground hover:text-foreground"
            >
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
        <div className="portal-amber-panel rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────── */}
      {loading && (
        <SurfacePanel radius="xl" tone="soft" padding="roomy">
          <BillingPanelSkeleton />
        </SurfacePanel>
      )}

      {/* ── Active subscription management ────────────────── */}
      {!loading &&
        subscription &&
        !['expired', 'pending'].includes(subscription.status) && (
          <motion.div {...fadeUpMotion(!!reduceMotion, { distance: 12 })}>
            <SurfacePanel radius="xl" tone="soft" padding="roomy">
              <div className="flex items-center gap-3 mb-3">
                <PortalBadge accent={tierAccent(subscription.tier)} size="sm">
                  {subscription.tier}
                </PortalBadge>
                <span className="text-sm text-muted-foreground">
                  {subscription.status === 'active'
                    ? 'Active'
                    : subscription.status === 'cancelled'
                      ? 'Cancelling'
                      : 'Past due'}
                </span>
                {subscription.promotionCode && (
                  <PortalBadge accent="gold" size="xs">
                    {subscription.promotionCode}
                    {subscription.promotionCyclesRemaining > 0 &&
                      ` · ${subscription.promotionCyclesRemaining} left`}
                  </PortalBadge>
                )}
              </div>

              <StatStrip columns={2}>
                <StatStripCell label="Period" showDivider>
                  {new Date(
                    subscription.currentPeriodStart
                  ).toLocaleDateString()}
                  {' → '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </StatStripCell>
                <StatStripCell
                  label={
                    subscription.status === 'cancelled' ? 'Expires' : 'Renews'
                  }
                >
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </StatStripCell>
              </StatStrip>

              {subscription.status === 'active' && (
                <div className="mt-4">
                  {confirmCancel ? (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-xs text-muted-foreground">
                        Access continues until{' '}
                        {new Date(
                          subscription.currentPeriodEnd
                        ).toLocaleDateString()}
                        . Sure?
                      </p>
                      <Button
                        variant="destructive"
                        size="xs"
                        loading={cancelling}
                        onClick={handleCancel}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setConfirmCancel(false)}
                      >
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmCancel(true)}
                      className="text-muted-foreground"
                    >
                      Cancel renewal
                    </Button>
                  )}
                </div>
              )}

              {subscription.status === 'cancelled' && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Your {subscription.tier} access continues until{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  , then reverts to free.
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
              <Zap
                className="h-5 w-5"
                style={{ color: portalColors[accent] }}
              />
              <h3
                className="text-lg font-bold tracking-[-0.02em]"
                style={{ color: portalColors[accent] }}
              >
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
                    $
                    {(targetPlan.promotion.discountedAmountMinor / 100).toFixed(
                      0
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    /{targetPlan.interval} + tax
                  </span>
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
                  <span className="text-sm text-muted-foreground">
                    /{targetPlan.interval} + tax
                  </span>
                </>
              )}
            </div>

            <StatStrip columns={2} className="mb-2">
              <StatStripCell
                label="Burst / min"
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
                style={
                  {
                    '--_focus-accent': `color-mix(in srgb, ${portalColors[accent]} 50%, transparent)`,
                  } as React.CSSProperties
                }
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
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium tracking-[-0.01em] outline-none placeholder:text-muted-foreground/50"
                />
              </SurfacePanel>
              <PortalFieldSelect
                value={billingCountry}
                onChange={(code) => {
                  setBillingCountry(code);
                  setBillingRegion('');
                  setBillingPostalCode('');
                  setBillingLine1('');
                  setBillingCity('');
                }}
                options={BILLING_COUNTRY_SELECT_OPTIONS}
                ariaLabel="Billing country"
                placeholder="Billing country"
                compact
                triggerClassName="border-border/40 bg-background/45"
              />
              <SurfacePanel
                radius="md"
                tone="inset"
                borderTone="subtle"
                padding="none"
                className="px-4 py-3"
              >
                <input
                  type="text"
                  value={billingLine1}
                  onChange={(e) => setBillingLine1(e.target.value)}
                  placeholder="Street address (optional)"
                  autoComplete="address-line1"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
                />
              </SurfacePanel>
              <SurfacePanel
                radius="md"
                tone="inset"
                borderTone="subtle"
                padding="none"
                className="px-4 py-3"
              >
                <input
                  type="text"
                  value={billingCity}
                  onChange={(e) => setBillingCity(e.target.value)}
                  placeholder="City (optional)"
                  autoComplete="address-level2"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
                />
              </SurfacePanel>
              {needsRegion ? (
                <PortalFieldSelect
                  value={billingRegion}
                  onChange={setBillingRegion}
                  options={regionSelectOptions(billingCountry)}
                  ariaLabel={
                    billingCountry === 'US'
                      ? 'Billing state'
                      : 'Billing province'
                  }
                  placeholder={
                    billingCountry === 'US' ? 'State' : 'Province / territory'
                  }
                  compact
                  triggerClassName="border-border/40 bg-background/45"
                />
              ) : null}
              <SurfacePanel
                radius="md"
                tone="inset"
                borderTone="subtle"
                padding="none"
                className="px-4 py-3"
              >
                <input
                  type="text"
                  value={billingPostalCode}
                  onChange={(e) => setBillingPostalCode(e.target.value)}
                  placeholder={postalCodePlaceholder(billingCountry)}
                  inputMode={billingCountry === 'US' ? 'numeric' : 'text'}
                  autoComplete="postal-code"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
                />
              </SurfacePanel>
              <SurfacePanel
                radius="md"
                tone="inset"
                borderTone="subtle"
                padding="none"
                className="px-4 py-3"
              >
                <input
                  type="text"
                  value={billingCompanyName}
                  onChange={(e) => setBillingCompanyName(e.target.value)}
                  placeholder="Company name (optional)"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
                />
              </SurfacePanel>
              <SurfacePanel
                radius="md"
                tone="inset"
                borderTone="subtle"
                padding="none"
                className="px-4 py-3"
              >
                <input
                  type="text"
                  value={billingVatId}
                  onChange={(e) => setBillingVatId(e.target.value)}
                  placeholder="Business VAT ID (optional)"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
                />
              </SurfacePanel>
              <BillingTaxPreviewPanel
                preview={taxPreview.preview}
                loading={taxPreview.loading}
                error={taxPreview.error}
              />
              <div className="min-h-5">
                <AnimatePresence initial={false}>
                  {showEmailHint && (
                    <motion.div
                      key="email-hint"
                      {...fadeUpMotion(!!reduceMotion, {
                        distance: 4,
                        duration: 0.18,
                      })}
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
                disabled={upgrading || !billingReady}
                variant={accent === 'purple' ? 'secondary' : 'default'}
                className="w-full justify-center"
                size="cta"
              >
                Continue to checkout
              </Button>
              <p className="text-center portal-type-label leading-relaxed text-muted-foreground">
                Checkout first, then create your API key right after payment.
                Billed monthly via Revolut. Cancel anytime.
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
          You&apos;re on a higher plan. Cancel renewal first, keep access until
          it ends, then buy this plan later if you still need it.
        </div>
      )}

      {!loading && invoices.length > 0 && (
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="roomy"
          className="space-y-3"
        >
          <h2 className="text-sm font-semibold tracking-[-0.01em]">Invoices</h2>
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 text-sm border-b border-border/20 pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.issuedAt).toLocaleDateString()} · {inv.tier} ·{' '}
                    {inv.billingCountry}
                    {inv.taxMinor > 0
                      ? ` · VAT $${(inv.taxMinor / 100).toFixed(2)}`
                      : ` · ${inv.taxTreatment.replace(/_/g, ' ')}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium">
                    ${(inv.totalMinor / 100).toFixed(2)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    loading={downloadingInvoiceId === inv.id}
                    disabled={downloadingInvoiceId === inv.id}
                    onClick={() => void handleDownloadInvoice(inv)}
                  >
                    PDF
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SurfacePanel>
      )}
    </PageShell>
  );
}
