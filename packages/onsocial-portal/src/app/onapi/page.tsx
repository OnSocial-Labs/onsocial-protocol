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
import { Button } from '@/components/ui/button';
import {
  portalBadgeStyle,
  portalColors,
  portalFrameStyle,
  type PortalAccent,
} from '@/lib/portal-colors';

const CREDIT_FLOW = [
  {
    step: '01',
    title: 'Purchase credits',
    desc: 'Buy credits with SOCIAL.',
    accent: 'green' as PortalAccent,
    icon: Coins,
  },
  {
    step: '02',
    title: 'Fund the shared rail',
    desc: '60% funds infrastructure. 40% flows to staking rewards.',
    accent: 'blue' as PortalAccent,
    icon: Server,
  },
  {
    step: '03',
    title: 'Use one gateway',
    desc: 'Unlock deeper queries and smoother app flows from one access layer.',
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
    priceNote: '/mo in $SOCIAL',
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
    priceNote: '/mo in $SOCIAL',
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-8 px-2 py-4 text-center md:py-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-80 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 22% 18%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 52% 20%, rgba(96,165,250,0.18), transparent 38%), radial-gradient(circle at 82% 24%, rgba(192,132,252,0.16), transparent 32%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-4xl">
          <h1 className="mx-auto max-w-3xl text-center text-4xl font-bold tracking-[-0.03em] md:text-6xl">
            OnApi credits for simpler access
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
            Pay in SOCIAL for gateway access, richer queries, and smoother app
            flows.
          </p>
        </div>
      </motion.div>

      <section ref={ref} className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="py-1"
        >
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                How credits work
              </span>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
                Clear split. One rail
              </h2>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground md:text-right">
              One credit rail funds infrastructure and staking rewards.
            </p>
          </div>

          <div className="grid gap-6 border-t border-border/50 pt-6 md:grid-cols-3 md:gap-8">
            {CREDIT_FLOW.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="border-l border-border/50 pl-5 md:pl-6"
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
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Tier comparison
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
              Choose the tier you need.
            </h2>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground md:text-right">
            Start on Free, then step up when your app needs more headroom.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {API_TIERS.map((tier) => (
            <div
              key={tier.name}
              className="relative flex h-full flex-col overflow-hidden rounded-[1.6rem] border border-border/50 bg-background/45 p-5 md:p-6"
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
                  <span
                    className="rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em]"
                    style={portalBadgeStyle(
                      tier.available ? 'green' : tier.accent
                    )}
                  >
                    {tier.available ? 'Live now' : 'Coming soon'}
                  </span>
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

                <div className="mt-5 space-y-3 border-t border-border/50 pt-4">
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
                      Use free tier
                      <ArrowRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Planned tier
                      <ArrowUpRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.18 }}
        className="rounded-[1.5rem] border border-border/50 bg-background/40 p-4 md:p-5"
      >
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Info className="portal-blue-icon mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="leading-6">
            Free tier is available now. Pro and Scale tiers launch when credit
            purchasing is integrated with the gateway. Pricing remains
            SOCIAL-denominated and settles at market rate via Ref Finance
            oracle.
          </p>
        </div>
      </motion.div>
    </PageShell>
  );
}
