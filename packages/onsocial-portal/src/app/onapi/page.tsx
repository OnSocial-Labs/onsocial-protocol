'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';
import {
  fetchPlansPublic,
  type PlanInfo,
} from '@/features/onapi/billing-api';

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
    live: true,
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
    live: true,
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
    live: true,
  },
];

export default function OnApiPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });

  // Fetch live plan data (includes promotions) on mount
  const [livePlans, setLivePlans] = useState<PlanInfo[]>([]);
  useEffect(() => {
    fetchPlansPublic().then((p) => setLivePlans(p));
  }, []);

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
        description="A single endpoint for reads, queries, and gasless transactions."
      />

      {/* ── Access Tiers ──────────────────────────────────────── */}
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
      >
        <SectionHeader
          badge="Access Tiers"
          badgeAccent="blue"
          align="center"
          className="mb-4"
        />

        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier) => (
            <Link
              key={tier.name}
              href={
                tier.name === 'Free'
                  ? '/onapi/keys'
                  : `/onapi/billing?tier=${tier.name.toLowerCase()}`
              }
              className="group"
            >
              <SurfacePanel
                radius="xl"
                tone="soft"
                padding="none"
                className="transition-[border-color,box-shadow] duration-200 hover:border-[var(--_accent-border)] hover:shadow-[0_0_20px_var(--_accent-shadow)]"
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
                    <span
                      className="text-[10px] font-medium uppercase tracking-[0.14em]"
                      style={{
                        color: tier.live
                          ? portalColors.green
                          : 'var(--muted-foreground)',
                      }}
                    >
                      {tier.live ? 'Live' : 'Planned'}
                    </span>
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
                  <StatStripCell label="Rate" value={tier.rate} showDivider />
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

                <div className="px-5 pb-4 pt-3 md:px-6">
                  <span
                    className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
                    style={{ color: portalColors[tier.accent] }}
                  >
                    {tier.name === 'Free' ? 'Get started' : 'Subscribe'}
                    <ArrowUpRight className="h-3 w-3 opacity-40 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </SurfacePanel>
            </Link>
          ))}
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Paid tiers billed monthly via Revolut.{' '}
          <Link href="/onapi/billing" className="underline hover:text-foreground">
            Manage billing →
          </Link>
        </p>
      </motion.div>
    </PageShell>
  );
}
