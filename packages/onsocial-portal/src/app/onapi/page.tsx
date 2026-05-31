'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, Key } from 'lucide-react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { fadeUpMotion } from '@/lib/motion';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  portalColors,
  portalFrameBorders,
  portalFrameBackgrounds,
  type PortalAccent,
} from '@/lib/portal-colors';
import { useGatewayAuth } from '@/contexts/gateway-auth-context';
import {
  fetchPlansPublic,
  fetchSubscription,
  type PlanInfo,
} from '@/features/onapi/billing-api';
import {
  listApiKeys,
  listDeveloperApps,
  type ApiKeyInfo,
  type DeveloperAppInfo,
} from '@/features/onapi/api';

// ─── Access tiers ─────────────────────────────────────────────
const TIERS = [
  {
    name: 'Free',
    price: '$0',
    priceNote: 'forever',
    rate: '60 /min',
    depth: '3',
    complexity: '50',
    rows: '100',
    aggregations: false,
    accent: 'green' as PortalAccent,
  },
  {
    name: 'Pro',
    price: '$49',
    priceNote: '/mo',
    rate: '600 /min',
    depth: '8',
    complexity: '1,000',
    rows: '10,000',
    aggregations: true,
    accent: 'blue' as PortalAccent,
  },
  {
    name: 'Scale',
    price: '$199',
    priceNote: '/mo',
    rate: '3,000 /min',
    depth: '12',
    complexity: '5,000',
    rows: '50,000',
    aggregations: true,
    accent: 'purple' as PortalAccent,
  },
];

// ── Helpers ───────────────────────────────────────────────────

function maskKey(prefix: string): string {
  return `${prefix}${'•'.repeat(20)}`;
}

function tierRank(tier: string): number {
  const ranks: Record<string, number> = {
    free: 0,
    pro: 1,
    scale: 2,
    service: 3,
  };
  return ranks[tier] ?? -1;
}

const TIER_ACCENT: Record<string, PortalAccent> = {
  free: 'green',
  pro: 'blue',
  scale: 'purple',
};
function tierAccent(tier: string): PortalAccent {
  return TIER_ACCENT[tier] ?? 'neutral';
}

type OnApiUserData = {
  jwt: string;
  currentTier: string;
  keys: ApiKeyInfo[];
  apps: DeveloperAppInfo[];
};

export default function OnApiPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const { jwt } = useGatewayAuth();

  // Fetch live plan data (includes promotions) on mount
  const [livePlans, setLivePlans] = useState<PlanInfo[]>([]);
  useEffect(() => {
    fetchPlansPublic().then((p) => setLivePlans(p));
  }, []);

  // Fetch user's current tier + keys + apps when authenticated
  const [userData, setUserData] = useState<OnApiUserData | null>(null);

  useEffect(() => {
    if (!jwt) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void Promise.all([
        fetchSubscription(jwt).catch(() => ({ tier: 'free' })),
        listApiKeys(jwt).catch(() => []),
        listDeveloperApps(jwt).catch(() => []),
      ]).then(([sub, keyList, appList]) => {
        if (cancelled) {
          return;
        }

        setUserData({
          jwt,
          currentTier: sub.tier.toLowerCase(),
          keys: keyList,
          apps: appList,
        });
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [jwt]);

  const visibleUserData = userData?.jwt === jwt ? userData : null;
  const visibleCurrentTier = visibleUserData?.currentTier ?? 'free';
  const visibleKeys = visibleUserData?.keys ?? [];
  const visibleApps = visibleUserData?.apps ?? [];

  // Merge live promo data into static tiers
  const tiers = TIERS.map((tier) => {
    const live = livePlans.find(
      (p) => p.tier.toLowerCase() === tier.name.toLowerCase()
    );
    return {
      ...tier,
      promotion: live?.promotion ?? null,
    };
  });

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="OnAPI"
        badgeAccent="purple"
        glowAccents={['purple', 'blue']}
        title="Build on the social layer"
        description="Query social graphs, compose on-chain content, and relay gasless transactions — one API for everything on OnSocial."
      />

      {/* ── Access Tiers ──────────────────────────────────────── */}
      <motion.div
        ref={ref}
        {...fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4 })}
        animate={
          isInView
            ? fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4 })
                .animate
            : {}
        }
      >
        <SectionHeader badge="Access Tiers" align="center" className="mb-4" />

        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier, index) => {
            const isCurrent =
              jwt && visibleCurrentTier === tier.name.toLowerCase();
            const tierKey = tier.name.toLowerCase();
            const isServiceTier = visibleCurrentTier === 'service';
            const isUpgrade =
              jwt &&
              !isServiceTier &&
              tierRank(tierKey) > tierRank(visibleCurrentTier);
            const isDowngrade =
              jwt &&
              !isServiceTier &&
              tierRank(tierKey) < tierRank(visibleCurrentTier);
            const href = isCurrent
              ? '/onapi/keys'
              : tierKey === 'free' && !isDowngrade
                ? '/onapi/keys'
                : `/onapi/keys?tier=${tierKey}`;

            return (
              <motion.div
                key={tier.name}
                {...fadeUpMotion(!!reduceMotion, {
                  distance: 20,
                  duration: 0.4,
                  delay: 0.1 + index * 0.06,
                })}
                animate={
                  isInView
                    ? fadeUpMotion(!!reduceMotion, {
                        distance: 20,
                        duration: 0.4,
                        delay: 0.1 + index * 0.06,
                      }).animate
                    : {}
                }
              >
                <Link href={href} className="group block h-full">
                  <SurfacePanel
                    radius="xl"
                    tone="soft"
                    padding="none"
                    className={`transition-[border-color,box-shadow] duration-200 hover:border-[var(--_accent-border)] hover:shadow-[0_0_20px_var(--_accent-shadow)] ${isCurrent ? 'border-[var(--_accent-border)] shadow-[0_0_20px_var(--_accent-shadow)]' : ''}`}
                    style={
                      {
                        '--_accent-border': `color-mix(in srgb, ${portalColors[tier.accent]} 35%, transparent)`,
                        '--_accent-shadow': `color-mix(in srgb, ${portalColors[tier.accent]} 20%, transparent)`,
                      } as React.CSSProperties
                    }
                  >
                    <div className="px-5 pt-5 pb-1 md:px-6 md:pt-6">
                      <div className="flex items-center justify-between gap-3">
                        <h3
                          className="text-lg font-bold tracking-[-0.02em]"
                          style={{ color: portalColors[tier.accent] }}
                        >
                          {tier.name}
                        </h3>
                        {isCurrent && (
                          <span
                            className="portal-eyebrow"
                            style={{ color: portalColors[tier.accent] }}
                          >
                            Current plan
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-baseline gap-1">
                        {tier.promotion ? (
                          <>
                            <span className="text-lg font-medium text-muted-foreground line-through">
                              {tier.price}
                            </span>
                            <span className="text-2xl font-bold tracking-[-0.03em]">
                              {tier.promotion.discountedPrice}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {tier.priceNote}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-2xl font-bold tracking-[-0.03em]">
                              {tier.price}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {tier.priceNote}
                            </span>
                          </>
                        )}
                      </div>
                      {tier.promotion && (
                        <p
                          className="mt-1 text-xs font-medium"
                          style={{ color: portalColors[tier.accent] }}
                        >
                          {tier.promotion.name} —{' '}
                          {tier.promotion.discountPercent}% off
                          {tier.promotion.durationCycles > 0
                            ? ` for ${tier.promotion.durationCycles} mo`
                            : ''}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 space-y-0 px-5 md:px-6">
                      {[
                        { label: 'Requests', val: tier.rate },
                        { label: 'Depth', val: tier.depth },
                        { label: 'Complexity', val: tier.complexity },
                        { label: 'Rows', val: tier.rows },
                        {
                          label: 'Analytics',
                          val: tier.aggregations ? 'Custom' : 'Prebuilt',
                          accent: tier.aggregations,
                        },
                      ].map((spec, i) => (
                        <div key={spec.label}>
                          {i > 0 && (
                            <div className="h-px w-full divider-detail" />
                          )}
                          <div className="flex items-center justify-between py-2">
                            <span className="portal-eyebrow text-muted-foreground">
                              {spec.label}
                            </span>
                            <span
                              className={`font-mono portal-type-body font-semibold ${
                                spec.accent === true
                                  ? 'portal-green-text'
                                  : spec.accent === false
                                    ? 'text-muted-foreground/60'
                                    : 'text-portal-neutral'
                              }`}
                            >
                              {spec.val}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="px-5 pb-5 pt-4 md:px-6">
                      <span
                        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
                        style={{ color: portalColors[tier.accent] }}
                      >
                        {isCurrent
                          ? 'Manage'
                          : isDowngrade
                            ? 'Downgrade'
                            : isUpgrade
                              ? 'Upgrade'
                              : 'Get started'}
                        <ArrowUpRight className="h-3 w-3 opacity-40 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </span>
                    </div>
                  </SurfacePanel>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* ── Your keys (truncated) ───────────────────────────── */}
        {jwt && visibleKeys.length > 0 && (
          <motion.div
            className="mt-8"
            {...fadeUpMotion(!!reduceMotion, {
              distance: 20,
              duration: 0.4,
              delay: 0.35,
            })}
            animate={
              isInView
                ? fadeUpMotion(!!reduceMotion, {
                    distance: 20,
                    duration: 0.4,
                    delay: 0.35,
                  }).animate
                : {}
            }
          >
            <Link href="/onapi/keys" className="group block">
              <SurfacePanel
                radius="xl"
                tone="soft"
                padding="none"
                className="overflow-hidden transition-[border-color] duration-200 group-hover:border-border/70"
              >
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <h3 className="portal-eyebrow-wide text-muted-foreground">
                    Manage keys
                  </h3>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 transition-all duration-200 group-hover:text-foreground/80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <div>
                  {visibleKeys.slice(0, 3).map((k, i) => (
                    <div key={k.prefix}>
                      {i > 0 && (
                        <div className="h-px divider-detail mx-4 md:mx-5" />
                      )}
                      <div className="flex items-center gap-3 px-5 py-2.5">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                          style={{
                            borderColor:
                              portalFrameBorders[
                                tierAccent(visibleCurrentTier)
                              ],
                            backgroundColor:
                              portalFrameBackgrounds[
                                tierAccent(visibleCurrentTier)
                              ],
                          }}
                        >
                          <Key
                            className="h-3 w-3"
                            style={{
                              color:
                                portalColors[tierAccent(visibleCurrentTier)],
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <code className="block truncate font-mono text-xs text-foreground">
                            {maskKey(k.prefix)}
                          </code>
                          <p className="mt-0.5 portal-type-caption text-muted-foreground">
                            {k.label}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {visibleKeys.length > 3 && (
                  <div className="px-5 pb-3 pt-1 text-xs text-muted-foreground">
                    +{visibleKeys.length - 3} more
                  </div>
                )}
              </SurfacePanel>
            </Link>
          </motion.div>
        )}

        {/* ── Your apps ──────────────────────────────────────── */}
        {jwt && visibleApps.length > 0 && (
          <motion.div
            className="mt-4"
            {...fadeUpMotion(!!reduceMotion, {
              distance: 20,
              duration: 0.4,
              delay: 0.4,
            })}
            animate={
              isInView
                ? fadeUpMotion(!!reduceMotion, {
                    distance: 20,
                    duration: 0.4,
                    delay: 0.4,
                  }).animate
                : {}
            }
          >
            <Link href="/onapi/apps" className="group block">
              <SurfacePanel
                radius="xl"
                tone="soft"
                padding="none"
                className="overflow-hidden transition-[border-color] duration-200 group-hover:border-border/70"
              >
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <h3 className="portal-eyebrow-wide text-muted-foreground">
                    App namespaces
                  </h3>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 transition-all duration-200 group-hover:text-foreground/80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <div>
                  {visibleApps.slice(0, 3).map((app, i) => (
                    <div key={app.appId}>
                      {i > 0 && (
                        <div className="h-px divider-detail mx-4 md:mx-5" />
                      )}
                      <div className="flex items-center gap-3 px-5 py-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/20">
                          <Boxes className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <code className="block truncate font-mono text-xs text-foreground">
                            {app.appId}
                          </code>
                          <p className="mt-0.5 portal-type-caption text-muted-foreground">
                            {new Date(app.createdAt).toLocaleDateString(
                              undefined,
                              { month: 'short', day: 'numeric' }
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {visibleApps.length > 3 && (
                  <div className="px-5 pb-3 pt-1 text-xs text-muted-foreground">
                    +{visibleApps.length - 3} more
                  </div>
                )}
              </SurfacePanel>
            </Link>
          </motion.div>
        )}
      </motion.div>
    </PageShell>
  );
}
