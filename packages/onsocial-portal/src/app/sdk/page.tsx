'use client';

import { motion } from 'framer-motion';
import {
  Terminal,
  ArrowRight,
  ExternalLink,
  Package,
  BookOpen,
  Layers,
  Shield,
  Gift,
} from 'lucide-react';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import {
  portalBadgeStyle,
  portalColors,
  portalFrameStyle,
  type PortalAccent,
} from '@/lib/portal-colors';

const SDK_CAPABILITIES = [
  {
    title: 'Integrate modular packages',
    desc: 'Adopt rewards, auth, and intents independently instead of onboarding a monolithic stack all at once.',
    accent: 'blue' as PortalAccent,
    icon: Layers,
  },
  {
    title: 'Ship user-facing flows faster',
    desc: 'Move from raw protocol calls to higher-level building blocks that match common product surfaces.',
    accent: 'green' as PortalAccent,
    icon: Gift,
  },
  {
    title: 'Keep protocol-level guarantees',
    desc: 'SDK packages still align with the same on-chain contracts and transparent protocol primitives underneath.',
    accent: 'slate' as PortalAccent,
    icon: Shield,
  },
];

const SDK_PACKAGES = [
  {
    name: '@onsocial-id/rewards',
    desc: 'Reward users with $SOCIAL tokens — gasless claims, per-dapp pools, daily caps.',
    status: 'beta' as const,
    accent: 'green' as PortalAccent,
  },
  {
    name: '@onsocial/auth',
    desc: 'Passwordless NEAR auth with JWT — social login, session management, key rotation.',
    status: 'development' as const,
    accent: 'blue' as PortalAccent,
  },
  {
    name: '@onsocial/intents',
    desc: 'Cross-chain intent execution — bridge, swap, and transact across chains.',
    status: 'development' as const,
    accent: 'purple' as PortalAccent,
  },
];

const EXAMPLES = [
  {
    title: 'Telegram Rewards Bot',
    desc: 'Auto-reward group messages with $SOCIAL tokens. 5 lines of code.',
    href: '/partners',
    linkText: 'See integration guide',
  },
  {
    title: 'API Credit Purchase',
    desc: 'Buy API credits with ft_transfer_call to unlock higher rate limits.',
    href: '/onapi',
    linkText: 'View tiers',
  },
  {
    title: 'Staking Interface',
    desc: 'Lock $SOCIAL with time-based bonuses. Pro-rata reward distribution.',
    href: '/staking',
    linkText: 'Try staking',
  },
];

export default function SDKPage() {
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
              'radial-gradient(circle at 20% 18%, rgba(96,165,250,0.16), transparent 34%), radial-gradient(circle at 50% 20%, rgba(74,222,128,0.14), transparent 36%), radial-gradient(circle at 82% 22%, rgba(192,132,252,0.16), transparent 32%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <div className="portal-green-frame inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-foreground">
              <Terminal className="h-4 w-4" />
              In development
            </div>
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-[-0.03em] md:text-6xl">
            OnSocial SDK for auth, rewards, and intents
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
            Build on NEAR with modular packages for common OnSocial app flows.
          </p>
        </div>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-8"
      >
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Why this SDK
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
              Fewer moving parts for app builders
            </h2>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground md:text-right">
            Use higher-level packages instead of wiring the same protocol pieces
            yourself.
          </p>
        </div>

        <div className="grid gap-6 border-t border-border/50 pt-6 md:grid-cols-3 md:gap-8">
          {SDK_CAPABILITIES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="relative border-l border-border/50 pl-5 md:pl-6"
              >
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border"
                  style={portalFrameStyle(item.accent)}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: portalColors[item.accent] }}
                  />
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
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mb-8"
      >
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Packages
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
              Start with the package you need
            </h2>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground md:text-right">
            Rewards is closest to beta. Auth and intents stay visible as the
            roadmap fills out.
          </p>
        </div>

        <div className="grid gap-3">
          {SDK_PACKAGES.map((pkg) => (
            <div
              key={pkg.name}
              className="rounded-[1.5rem] border border-border/50 bg-background/45 p-5 md:p-6"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border"
                      style={portalFrameStyle(pkg.accent)}
                    >
                      <Package
                        className="h-5 w-5"
                        style={{ color: portalColors[pkg.accent] }}
                      />
                    </div>
                    <div>
                      <span className="font-mono text-base font-semibold md:text-lg">
                        {pkg.name}
                      </span>
                    </div>
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {pkg.desc}
                  </p>
                </div>
                <div
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={
                    pkg.status === 'beta'
                      ? portalBadgeStyle('green')
                      : portalBadgeStyle('slate')
                  }
                >
                  {pkg.status === 'beta' ? 'Beta' : 'Coming soon'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16 }}
        className="mb-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-start"
      >
        <div className="rounded-[1.6rem] border border-border/50 bg-background/45 p-5 md:p-6">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Quick start
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
            Install the first live package
          </h2>
          <div className="mt-5 overflow-hidden rounded-[1.25rem] border border-border/50 bg-muted/20">
            <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground">
                terminal
              </span>
            </div>
            <pre className="overflow-x-auto p-4 text-sm font-mono text-foreground/85">
              <code>npm install @onsocial-id/rewards</code>
            </pre>
          </div>
        </div>

        <div className="border-t border-border/50 pt-5 lg:pt-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Source
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
            Source and docs in one repo
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Docs, examples, and package work ship alongside the protocol code.
          </p>
          <a
            href="https://github.com/OnSocial-Labs/onsocial-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="portal-action-link mt-5 inline-flex items-center gap-2 text-sm font-medium"
          >
            <BookOpen className="h-4 w-4" />
            View source and docs
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-4"
      >
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Examples
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] md:text-3xl">
              See real product surfaces
            </h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <Link
              key={ex.title}
              href={ex.href}
              className="group rounded-[1.5rem] border border-border/50 bg-background/45 p-5 transition-colors hover:border-border"
            >
              <h3 className="text-sm font-semibold md:text-base">{ex.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {ex.desc}
              </p>
              <div className="mt-5">
                <Button variant="outline" size="sm" className="gap-2">
                  {ex.linkText}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </Link>
          ))}
        </div>
      </motion.section>
    </PageShell>
  );
}
