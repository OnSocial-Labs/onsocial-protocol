'use client';

import { motion } from 'framer-motion';
import { Terminal, ExternalLink, Package, BookOpen } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';

const SDK_PACKAGES = [
  {
    name: 'OnSocial SDK',
    desc: 'One SDK for social and marketplace features.',
    status: 'development' as const,
    accent: 'blue' as PortalAccent,
  },
  {
    name: '@onsocial-id/rewards',
    desc: 'Live OnSocial partners integration package for rewards and claiming flows.',
    status: 'beta' as const,
    accent: 'green' as PortalAccent,
  },
];

const LIVE_SDK_PACKAGES = [
  {
    name: '@onsocial-id/rewards',
    manager: 'npm',
    command: 'npm install @onsocial-id/rewards',
    href: 'https://www.npmjs.com/package/@onsocial-id/rewards',
    linkLabel: 'View package',
    accent: 'green' as PortalAccent,
  },
];

export default function SDKPage() {
  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Builder toolkit"
        badgeAccent="green"
        glowAccents={['blue', 'green', 'purple']}
        title="Build on OnSocial with a Unified SDK"
        description="A unified client with optional gateway, relay, storage, and indexed reads built in when needed."
      />

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-8"
      >
        <SectionHeader badge="SDK" align="center" />

        <div className="mt-5 grid gap-3">
          {SDK_PACKAGES.map((pkg) => (
            <SurfacePanel
              key={pkg.name}
              radius="xl"
              tone="soft"
              padding="roomy"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex items-center gap-3">
                    <Package
                      className="h-5 w-5 shrink-0"
                      style={{ color: portalColors[pkg.accent] }}
                    />
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
                <PortalBadge
                  accent={pkg.status === 'beta' ? 'green' : 'slate'}
                  size="sm"
                >
                  {pkg.status === 'beta' ? 'Beta' : 'In development'}
                </PortalBadge>
              </div>
            </SurfacePanel>
          ))}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.16 }}
        className="mb-8 grid gap-5"
      >
        <SurfacePanel radius="xl" tone="soft" padding="roomy">
          <SectionHeader badge="Live Now" align="center" className="mb-0" />
          <div className="mt-5 grid gap-3">
            {LIVE_SDK_PACKAGES.map((pkg) => (
              <div
                key={pkg.name}
                className="rounded-[1rem] border border-border/40 bg-background/35 px-4 py-4"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <Package
                        className="h-5 w-5 shrink-0"
                        style={{ color: portalColors[pkg.accent] }}
                      />
                      <div>
                        <div className="font-mono text-base font-semibold text-foreground">
                          {pkg.name}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[0.9rem] border border-border/35 bg-background/55 px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        <Terminal className="h-4 w-4" />
                        <span className="font-mono">{pkg.manager}</span>
                      </div>
                      <pre className="mt-3 overflow-x-auto text-sm font-mono text-foreground/85">
                        <code>{pkg.command}</code>
                      </pre>
                    </div>
                  </div>

                  <a
                    href={pkg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-link inline-flex items-center gap-2 text-sm font-medium md:mt-1"
                  >
                    <BookOpen className="h-4 w-4" />
                    {pkg.linkLabel}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </SurfacePanel>

        <SurfacePanel radius="xl" tone="subtle" padding="roomy">
          <SectionHeader badge="Source" align="center" className="mb-0" />
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            The protocol repo includes the portal, live packages, and the
            contracts behind them.
          </p>
          <a
            href="https://github.com/OnSocial-Labs/onsocial-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="portal-action-link mt-4 inline-flex items-center gap-2 text-sm font-medium"
          >
            <BookOpen className="h-4 w-4" />
            View source and docs
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </SurfacePanel>
      </motion.section>
    </PageShell>
  );
}
