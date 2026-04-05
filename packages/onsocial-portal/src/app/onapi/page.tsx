'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ArrowUpRight,
  Coins,
  Server,
  Zap,
  ArrowRight,
  CheckCircle2,
  Info,
  Layers,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import { Button, buttonArrowRightClass } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  portalColors,
  portalFrameStyle,
  type PortalAccent,
} from '@/lib/portal-colors';

const CREDIT_FLOW = [
  {
    step: '01',
    title: 'Purchase Credits',
    desc: 'Buy credits using SOCIAL.',
    accent: 'green' as PortalAccent,
    icon: Coins,
  },
  {
    step: '02',
    title: 'Power the Network',
    desc: '60% supports infrastructure. 40% contributes to the participation pool.',
    accent: 'blue' as PortalAccent,
    icon: Server,
  },
  {
    step: '03',
    title: 'Use the Gateway',
    desc: 'Access deeper queries and run faster, more reliable apps through a single endpoint.',
    accent: 'purple' as PortalAccent,
    icon: Zap,
  },
];

// ─── API Credit Tiers ─────────────────────────────────────────
const API_TIERS = [
  {
    name: 'Free',
    price: '$0',
    priceNote: 'forever',
    rateLimit: '60 req/min',
    queryDepth: 3,
    complexity: 50,
    rowLimit: '100',
    aggregations: false,
    accent: 'green' as PortalAccent,
    available: true,
  },
  {
    name: 'Pro',
    price: '$49',
    priceNote: '/ month (in SOCIAL)',
    rateLimit: '600 req/min',
    queryDepth: 8,
    complexity: 1000,
    rowLimit: '10,000',
    aggregations: true,
    accent: 'blue' as PortalAccent,
    available: false,
  },
  {
    name: 'Scale',
    price: '$199',
    priceNote: '/ month (in SOCIAL)',
    rateLimit: '3,000 req/min',
    queryDepth: 12,
    complexity: 5000,
    rowLimit: '50,000',
    aggregations: true,
    accent: 'purple' as PortalAccent,
    available: false,
  },
];

export default function OnApiPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Gateway Access"
        badgeAccent="blue"
        glowAccents={['green', 'blue', 'purple']}
        title="Simple access to OnSocial data and actions"
        description="Use SOCIAL to power reads, advanced queries, and seamless application flows."
      />

      <section ref={ref} className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="py-1"
        >
          <SectionHeader
            badge="Credits"
            title="One system. Clear split."
            className="mb-6"
          />

          <div className="grid gap-6 border-t border-fade-section pt-6 md:grid-cols-3 md:gap-8">
            {CREDIT_FLOW.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="border-l border-fade-v-section pl-5 md:pl-6"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border"
                      style={portalFrameStyle(item.accent)}
                    >
                      <Icon
                        className="h-5 w-5"
                        style={{ color: portalColors[item.accent] }}
                      />
                    </div>
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold md:text-lg">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Access Tiers"
          title="Choose the access level your app needs"
        />

        <p className="mb-5 max-w-xl text-sm text-muted-foreground">
          Paid tiers define planned limits. Availability will be announced as
          they go live.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          {API_TIERS.map((tier) => (
            <SurfacePanel
              key={tier.name}
              radius="xl"
              tone="soft"
              padding="roomy"
              className="relative flex h-full flex-col overflow-hidden"
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-70 blur-2xl"
                style={{
                  background: `radial-gradient(circle at 20% 15%, ${portalColors[tier.accent]}, transparent 45%)`,
                }}
              />
              <div className="relative z-10">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border"
                    style={portalFrameStyle(tier.accent)}
                  >
                    {tier.accent === 'green' ? (
                      <Coins
                        className="h-5 w-5"
                        style={{ color: portalColors[tier.accent] }}
                      />
                    ) : tier.accent === 'blue' ? (
                      <Server
                        className="h-5 w-5"
                        style={{ color: portalColors[tier.accent] }}
                      />
                    ) : (
                      <Layers
                        className="h-5 w-5"
                        style={{ color: portalColors[tier.accent] }}
                      />
                    )}
                  </div>
                  <PortalBadge
                    accent={tier.available ? 'green' : tier.accent}
                    size="sm"
                    casing="uppercase"
                    tracking="normal"
                  >
                    {tier.available ? 'Live now' : 'Planned'}
                  </PortalBadge>
                </div>

                <h3 className="text-xl font-bold tracking-[-0.03em] md:text-2xl">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-bold tracking-[-0.03em] md:text-4xl">
                    {tier.price}
                  </span>
                  <span className="pb-1 text-sm text-muted-foreground">
                    {tier.priceNote}
                  </span>
                </div>

                <div className="mt-5 space-y-3 border-t border-fade-section pt-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Rate limit</span>
                    <span className="font-medium">{tier.rateLimit}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Query depth</span>
                    <span className="font-medium">{tier.queryDepth}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Complexity</span>
                    <span className="font-medium">
                      {tier.complexity.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Row limit</span>
                    <span className="font-medium">{tier.rowLimit}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Aggregations</span>
                    <span className="inline-flex items-center gap-1 font-medium">
                      {tier.aggregations ? (
                        <>
                          <CheckCircle2
                            className="h-4 w-4"
                            style={{ color: portalColors.green }}
                          />
                          Enabled
                        </>
                      ) : (
                        'Not included'
                      )}
                    </span>
                  </div>
                </div>

                <Button
                  disabled={!tier.available}
                  variant={tier.available ? 'accent' : 'outline'}
                  size="sm"
                  className="mt-5 w-full justify-center gap-2"
                >
                  {tier.available ? (
                    <>
                      Use Free Tier
                      <ArrowRight
                        className={`h-4 w-4 ${buttonArrowRightClass}`}
                      />
                    </>
                  ) : (
                    <>
                      Planned
                      <ArrowUpRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </SurfacePanel>
          ))}
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.18 }}
      >
        <SurfacePanel radius="xl" tone="soft" className="p-4 md:p-5">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Info className="portal-blue-icon mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="leading-6">
              Free tier is available now. Pro and Scale tiers will launch once
              credit purchasing is integrated with the gateway. Pricing remains
              SOCIAL-denominated and settles dynamically at market rate.
            </p>
          </div>
        </SurfacePanel>
      </motion.div>
    </PageShell>
  );
}
