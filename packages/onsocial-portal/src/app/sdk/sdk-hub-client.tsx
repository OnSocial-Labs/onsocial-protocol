'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Play,
  Terminal,
  Zap,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { CodeBlock } from '@/components/sdk/code-block';
import { MethodList } from '@/components/sdk/method-list';
import { PortalBadge } from '@/components/ui/portal-badge';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  SDK_BROWSER_STARTER_CODE,
  SDK_BUILD_PATHS,
  SDK_COMMUNITY_STARTER_CODE,
  SDK_DECISIONS,
  SDK_METHOD_FAMILIES,
  SDK_ON_RAMPS,
  SDK_PACKAGES,
  SDK_PLAYGROUND_RECIPES,
  SDK_PRODUCTION_CHECKS,
} from '@/data/sdk-hub-content';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';

function accentCardStyle(accent: PortalAccent): CSSProperties {
  return {
    '--_accent-border': `color-mix(in srgb, ${portalColors[accent]} 35%, transparent)`,
    '--_accent-shadow': `color-mix(in srgb, ${portalColors[accent]} 20%, transparent)`,
  } as CSSProperties;
}

const modernInteractiveCardClass =
  'h-full overflow-hidden transition-[border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:border-[var(--_accent-border)] [@media(hover:hover)]:hover:shadow-[0_0_20px_var(--_accent-shadow)]';

export function SdkHubClient() {
  return (
    <PageShell size="section" className="max-w-7xl">
      <SecondaryPageHeader
        badge="SDK Docs"
        badgeAccent="purple"
        glowAccents={['purple', 'blue', 'green']}
        title="Build with the OnSocial SDK"
        description="Listed community dapps use Continue with OnSocial. Wallet apps and this playground sign a challenge. Same client after that: write, read fresh, then query."
      >
        <Link
          href="/playground"
          className="portal-action-link inline-flex items-center gap-2 text-sm font-medium"
        >
          <Play className="h-4 w-4" />
          Open playground
        </Link>
        <a
          href="https://github.com/OnSocial-Labs/onsocial-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="portal-action-link inline-flex items-center gap-2 text-sm font-medium"
        >
          <BookOpen className="h-4 w-4" />
          Source
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </SecondaryPageHeader>

      <motion.section
        id="start"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Start Here"
          badgeAccent="blue"
          title="Pick the on-ramp"
          description="A listed community site does not connect a wallet on its origin. Wallet apps and the playground do. After auth, writes and queries are the same."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {SDK_ON_RAMPS.map((ramp) => {
            const Icon = ramp.icon;
            return (
              <SurfacePanel
                key={ramp.title}
                radius="xl"
                tone="soft"
                padding="roomy"
                className="min-w-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <PortalBadge accent={ramp.accent} size="sm">
                    {ramp.badge}
                  </PortalBadge>
                  <Icon
                    className="h-5 w-5"
                    style={{ color: portalColors[ramp.accent] }}
                  />
                </div>
                <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em]">
                  {ramp.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {ramp.body}
                </p>
                <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
                  {ramp.steps.map((step) => (
                    <li key={step} className="flex gap-2">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={ramp.href}
                  className="portal-action-link mt-4 inline-flex items-center gap-2 text-sm font-medium"
                >
                  {ramp.hrefLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </SurfacePanel>
            );
          })}
        </div>
      </motion.section>

      <motion.section
        id="build-path"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Build Path"
          badgeAccent="green"
          title="Then the app shape"
          description="Community is the default for a public https site on the launcher. Wallet broadcast is the default for first-party apps. Add a backend or session key only when the flow needs it."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {SDK_BUILD_PATHS.map((path) => {
            const Icon = path.icon;
            return (
              <SurfacePanel
                key={path.title}
                radius="xl"
                tone="soft"
                padding="roomy"
                className="min-w-0"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border border-border/35 bg-background/50"
                    style={{ color: portalColors[path.accent] }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-[-0.02em]">
                      {path.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {path.bestFor}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
                  {path.steps.map((step) => (
                    <li key={step} className="flex gap-2">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </SurfacePanel>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SurfacePanel
            radius="xl"
            tone="subtle"
            padding="spacious"
            className="min-w-0"
          >
            <SectionHeader
              badge="Community starter"
              badgeAccent="blue"
              title="Continue with OnSocial"
              description="Paste this on the listed origin. First visit throws AppHandoffRedirect and goes to OS /handoff. Later visits restore the refresh token."
              className="mb-0"
            />
            <CodeBlock code={SDK_COMMUNITY_STARTER_CODE} />
          </SurfacePanel>
          <SurfacePanel
            radius="xl"
            tone="subtle"
            padding="spacious"
            className="min-w-0"
          >
            <SectionHeader
              badge="Wallet starter"
              badgeAccent="green"
              title="Challenge plus broadcast"
              description="The playground shape: wallet, OnAPI JWT, one write, fresh read, indexed feed."
              className="mb-0"
            />
            <CodeBlock code={SDK_BROWSER_STARTER_CODE} />
          </SurfacePanel>
        </div>
      </motion.section>

      <motion.section
        id="choices"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Choices"
          badgeAccent="green"
          title="Pick the right execution path"
          description="Most confusion comes from mixing these surfaces. Treat this as the decision table before choosing a method."
        />
        <div className="overflow-hidden rounded-[1.25rem] border border-border/45 bg-background/35">
          <div className="grid grid-cols-12 border-b border-border/35 bg-muted/20 px-4 py-3 portal-eyebrow text-muted-foreground">
            <div className="col-span-12 md:col-span-3">Choice</div>
            <div className="hidden md:col-span-3 md:block">Use for</div>
            <div className="hidden md:col-span-2 md:block">Wallet</div>
            <div className="hidden md:col-span-2 md:block">Auth</div>
            <div className="hidden md:col-span-2 md:block">Methods</div>
          </div>
          {SDK_DECISIONS.map((decision) => (
            <div
              key={decision.choice}
              className="grid grid-cols-12 gap-3 border-b border-border/25 px-4 py-4 last:border-b-0"
            >
              <div className="col-span-12 md:col-span-3">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: portalColors[decision.accent] }}
                  />
                  {decision.choice}
                </div>
              </div>
              <div className="col-span-12 text-sm leading-6 text-muted-foreground md:col-span-3">
                {decision.use}
              </div>
              <div className="col-span-6 text-sm text-portal-neutral md:col-span-2">
                {decision.wallet}
              </div>
              <div className="col-span-6 text-sm text-portal-neutral md:col-span-2">
                {decision.auth}
              </div>
              <div className="col-span-12 font-mono text-xs leading-5 text-portal-neutral md:col-span-2">
                {decision.method}
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section
        id="playground-recipes"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Playground"
          badgeAccent="amber"
          title="Live recipes that teach the real API"
          description="The playground should stay recipe-first. Each example should show the method, whether it writes, how it reads back, and when the indexer may lag."
          aside={
            <Link
              href="/playground"
              className="portal-action-link inline-flex items-center gap-2 text-sm font-medium"
            >
              Try the examples
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SDK_PLAYGROUND_RECIPES.map((recipe) => (
            <Link
              key={recipe.title}
              href={recipe.href}
              className="group block min-w-0 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-ring/60"
            >
              <SurfacePanel
                radius="xl"
                tone="subtle"
                padding="roomy"
                interactive
                className={`${modernInteractiveCardClass} min-w-0`}
                style={accentCardStyle(recipe.accent)}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">
                    {recipe.title}
                  </h2>
                  <PortalBadge accent={recipe.accent} size="sm">
                    <span className="inline-flex items-center gap-1">
                      Open
                      <ProtocolMotionArrow className="h-3 w-3" />
                    </span>
                  </PortalBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recipe.badges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-border/35 bg-background/45 px-2.5 py-1 portal-type-label font-medium text-muted-foreground"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <MethodList items={recipe.methods} />
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {recipe.note}
                </p>
              </SurfacePanel>
            </Link>
          ))}
        </div>
      </motion.section>

      <motion.section
        id="methods"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Methods"
          badgeAccent="purple"
          title="SDK method families"
          description="Use the noun modules first. Drop down to raw social data, builders, or execute only when your app needs composition the higher-level methods do not express yet."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {SDK_METHOD_FAMILIES.map((family) => {
            const Icon = family.icon;
            const familyId = family.href.split('/').pop();
            return (
              <Link
                key={family.title}
                href={family.href}
                className="group block min-w-0 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-ring/60"
              >
                <SurfacePanel
                  id={familyId}
                  radius="xl"
                  tone="soft"
                  padding="roomy"
                  interactive
                  className={`${modernInteractiveCardClass} scroll-mt-24 min-w-0`}
                  style={accentCardStyle(family.accent)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border border-border/35 bg-background/50"
                      style={{ color: portalColors[family.accent] }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold tracking-[-0.02em]">
                          {family.title}
                        </h2>
                        <PortalBadge accent={family.accent} size="sm">
                          <span className="inline-flex items-center gap-1">
                            Guide
                            <ProtocolMotionArrow className="h-3 w-3" />
                          </span>
                        </PortalBadge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {family.summary}
                      </p>
                    </div>
                  </div>
                  <MethodList items={family.methods} />
                </SurfacePanel>
              </Link>
            );
          })}
        </div>
      </motion.section>

      <motion.section
        id="batching"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25 }}
        className="mb-8 grid gap-4 lg:grid-cols-[1fr_1fr]"
      >
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="spacious"
          className="min-w-0"
        >
          <SectionHeader
            badge="Batching"
            badgeAccent="amber"
            title="One intent, one transaction"
            description="Use high-level methods for ordinary app code. Use builders plus os.social.set when a single user intent needs multiple canonical paths written atomically."
            className="mb-0"
          />
          <CodeBlock
            code={`import { buildPostSetData, buildReplySetData } from '@onsocial/sdk';

await os.social.set({
  ...buildPostSetData(rootPost, rootPostId),
  ...buildReplySetData(accountId, rootPostId, reply, replyId),
});`}
          />
        </SurfacePanel>

        <SurfacePanel
          radius="xl"
          tone="subtle"
          padding="spacious"
          className="min-w-0"
        >
          <SectionHeader
            badge="Production"
            badgeAccent="green"
            title="Ship checklist"
            description="These rules keep custom apps predictable once users, storage, indexer lag, permissions, and retries enter the picture."
            className="mb-0"
          />
          <ul className="mt-5 grid gap-3 text-sm leading-6 text-muted-foreground">
            {SDK_PRODUCTION_CHECKS.map((item) => (
              <li key={item} className="flex gap-3">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SurfacePanel>
      </motion.section>

      <motion.section
        id="packages"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Packages"
          badgeAccent="neutral"
          title="Installable surfaces"
          description="@onsocial/sdk is the unified client. It is not on npm yet — this repo uses workspace:*. The rewards package is on npm for partner-only integrations."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {SDK_PACKAGES.map((pkg) => (
            <SurfacePanel
              key={pkg.name}
              radius="xl"
              tone="soft"
              padding="roomy"
              className="min-w-0"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <Terminal
                      className="h-5 w-5 shrink-0"
                      style={{ color: portalColors[pkg.accent] }}
                    />
                    <div className="min-w-0">
                      <div className="break-words font-mono text-base font-semibold text-foreground md:text-lg">
                        {pkg.name}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {pkg.status}
                      </div>
                    </div>
                  </div>
                  <CodeBlock code={pkg.command} />
                </div>
                {pkg.href ? (
                  <a
                    href={pkg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-link inline-flex items-center gap-2 text-sm font-medium md:mt-1"
                  >
                    View package
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </SurfacePanel>
          ))}
        </div>
      </motion.section>
    </PageShell>
  );
}
