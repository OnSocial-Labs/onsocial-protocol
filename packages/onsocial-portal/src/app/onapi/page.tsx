'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Key } from 'lucide-react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { fadeUpMotion } from '@/lib/motion';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { portalColors, portalFrameBorders, portalFrameBackgrounds, type PortalAccent } from '@/lib/portal-colors';
import { useGatewayAuth } from '@/contexts/gateway-auth-context';
import {
  fetchPlansPublic,
  fetchSubscription,
  type PlanInfo,
} from '@/features/onapi/billing-api';
import {
  listApiKeys,
  type ApiKeyInfo,
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
  const ranks: Record<string, number> = { free: 0, pro: 1, scale: 2, service: 3 };
  return ranks[tier] ?? -1;
}

const TIER_ACCENT: Record<string, PortalAccent> = { free: 'green', pro: 'blue', scale: 'purple' };
function tierAccent(tier: string): PortalAccent { return TIER_ACCENT[tier] ?? 'green'; }

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

  // Fetch user's current tier + keys when authenticated
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);

  const loadUserData = useCallback(async () => {
    if (!jwt) return;
    const [sub, keyList] = await Promise.all([
      fetchSubscription(jwt).catch(() => ({ tier: 'free' })),
      listApiKeys(jwt).catch(() => []),
    ]);
    setCurrentTier(sub.tier.toLowerCase());
    setKeys(keyList);
  }, [jwt]);

  useEffect(() => {
    if (!jwt) {
      setCurrentTier('free');
      setKeys([]);
      return;
    }
    loadUserData();
  }, [loadUserData]);

  // Merge live promo data into static tiers
  const tiers = TIERS.map((tier) => {
    const live = livePlans.find(
      (p) => p.tier.toLowerCase() === tier.name.toLowerCase(),
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
        badgeAccent="blue"
        glowAccents={['green', 'blue', 'purple']}
        title="Access OnSocial data and actions"
        description="Query the NEAR blockchain, manage social graphs, and execute gasless transactions — all through one endpoint."
      />

      {/* ── Access Tiers ──────────────────────────────────────── */}
      <motion.div
        ref={ref}
        {...fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4 })}
        animate={isInView ? fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4 }).animate : {}}
      >
        <SectionHeader
          badge="Access Tiers"
          align="center"
          className="mb-4"
        />

        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier, index) => {
            const isCurrent = jwt && currentTier === tier.name.toLowerCase();
            const tierKey = tier.name.toLowerCase();
            const isUpgrade = jwt && tierRank(tierKey) > tierRank(currentTier);
            const isDowngrade = jwt && tierRank(tierKey) < tierRank(currentTier);
            const href = isCurrent || tierKey === 'free'
              ? '/onapi/keys'
              : isDowngrade
                ? '/onapi/keys'
                : `/onapi/keys?tier=${tierKey}`;

            return (
            <motion.div
              key={tier.name}
              {...fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4, delay: 0.1 + index * 0.06 })}
              animate={isInView ? fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4, delay: 0.1 + index * 0.06 }).animate : {}}
            >
            <Link
              href={href}
              className="group block h-full"
            >
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
                        className="text-[10px] font-medium uppercase tracking-[0.14em]"
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

                <StatStrip columns={3} className="mt-2">
                  <StatStripCell label="Requests" value={tier.rate} showDivider />
                  <StatStripCell
                    label="Depth"
                    value={tier.depth}
                    showDivider
                  />
                  <StatStripCell label="Complexity" value={tier.complexity} />
                </StatStrip>
                <StatStrip columns={2} groupClassName="border-t-0">
                  <StatStripCell label="Rows" value={tier.rows} showDivider />
                  <StatStripCell
                    label="Aggregations"
                    value={tier.aggregations ? 'Yes' : 'No'}
                    valueClassName={
                      tier.aggregations
                        ? 'portal-green-text'
                        : 'text-muted-foreground'
                    }
                  />
                </StatStrip>

                {!isDowngrade && (
                <div className="px-5 pb-4 pt-3 md:px-6">
                  <span
                    className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
                    style={{ color: portalColors[tier.accent] }}
                  >
                    {isCurrent
                      ? 'Manage'
                      : isUpgrade
                        ? 'Upgrade'
                        : 'Get started'}
                    <ArrowUpRight className="h-3 w-3 opacity-40 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
                )}
              </SurfacePanel>
            </Link>
            </motion.div>
            );
          })}
        </div>

        {/* ── Your keys (truncated) ───────────────────────────── */}
        {jwt && keys.length > 0 && (
          <motion.div
            className="mt-8"
            {...fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4, delay: 0.35 })}
            animate={isInView ? fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.4, delay: 0.35 }).animate : {}}
          >
            <Link href="/onapi/keys" className="group block">
            <SurfacePanel
              radius="xl"
              tone="soft"
              padding="none"
              className="overflow-hidden transition-[border-color] duration-200 group-hover:border-border/70"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Manage keys</h3>
                <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 transition-all duration-200 group-hover:text-foreground/80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <div>
                {keys.slice(0, 3).map((k, i) => (
                  <div key={k.prefix}>
                    {i > 0 && <div className="h-px divider-detail mx-4 md:mx-5" />}
                    <div className="flex items-center gap-3 px-5 py-2.5">
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
                          {maskKey(k.prefix)}
                        </code>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {k.label}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {keys.length > 3 && (
                <div className="px-5 pb-3 pt-1 text-xs text-muted-foreground">
                  +{keys.length - 3} more
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
