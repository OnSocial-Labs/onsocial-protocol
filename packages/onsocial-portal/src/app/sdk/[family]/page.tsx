'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Code2,
  Database,
  ListChecks,
  Route,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { Button, buttonArrowLeftClass } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  SDK_METHOD_GUIDES,
  getSdkMethodGuide,
  type SdkMethodGuide,
} from '@/data/sdk-method-guides';
import { portalColors } from '@/lib/portal-colors';

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="mt-4 rounded-[0.9rem] border border-border/35 bg-background/60 px-4 py-3 text-xs leading-6 text-foreground/85 md:text-sm">
      <code className="whitespace-pre-wrap break-words">{code}</code>
    </pre>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MethodList({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-[0.75rem] border border-border/30 bg-background/35 px-3 py-2 font-mono text-xs text-foreground/80 md:text-sm"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function BuildOrder({ guide }: { guide: SdkMethodGuide }) {
  return (
    <ol className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
      {guide.buildOrder.map((step, index) => (
        <li key={step} className="grid grid-cols-[auto_1fr] gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border/40 text-[11px] font-semibold"
            style={{ color: portalColors[guide.accent] }}
          >
            {index + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function FamilyGuideNav({ currentSlug }: { currentSlug: string }) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-8"
      aria-label="SDK method family guides"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-2 gap-y-2 rounded-[1.25rem] border border-border/35 bg-background/30 px-3 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:text-xs">
        {SDK_METHOD_GUIDES.map((guide) => {
          const active = guide.slug === currentSlug;
          const baseClass =
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors';

          if (active) {
            return (
              <span
                key={guide.slug}
                aria-current="page"
                className={`${baseClass} bg-background/60 text-foreground`}
                style={{ color: portalColors[guide.accent] }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: portalColors[guide.accent] }}
                />
                {guide.title}
              </span>
            );
          }

          return (
            <Link
              key={guide.slug}
              href={`/sdk/${guide.slug}`}
              className={`group ${baseClass} hover:text-foreground`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: portalColors[guide.accent] }}
              />
              {guide.title}
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}

function UnknownFamily() {
  return (
    <PageShell className="max-w-4xl">
      <SecondaryPageHeader
        badge="SDK"
        badgeAccent="slate"
        title="SDK method family not found"
        description="Choose one of the current method family guides from the SDK reference."
      >
        <Button variant="outline" asChild>
          <Link href="/sdk#methods">
            <ArrowLeft className={`h-4 w-4 ${buttonArrowLeftClass}`} />
            Back to SDK
          </Link>
        </Button>
      </SecondaryPageHeader>
      <SurfacePanel radius="xl" tone="soft" padding="roomy">
        <div className="grid gap-3 sm:grid-cols-2">
          {SDK_METHOD_GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              href={`/sdk/${guide.slug}`}
              className="rounded-[1rem] border border-border/35 bg-background/35 p-4 text-sm font-medium transition-colors hover:border-border hover:text-foreground"
            >
              <span
                className="inline-flex items-center gap-2"
                style={{ color: portalColors[guide.accent] }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: portalColors[guide.accent] }}
                />
                {guide.title}
              </span>
            </Link>
          ))}
        </div>
      </SurfacePanel>
    </PageShell>
  );
}

export default function SdkMethodFamilyPage() {
  const params = useParams<{ family: string }>();
  const familySlug = Array.isArray(params.family)
    ? params.family[0]
    : params.family;
  const guide = getSdkMethodGuide(familySlug ?? '');
  const { setNavBack } = useMobilePageContext();

  useEffect(() => {
    setNavBack({ label: 'SDK' });
    return () => setNavBack(null);
  }, [setNavBack]);

  if (!guide) return <UnknownFamily />;

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge={guide.badge}
        badgeAccent={guide.accent}
        glowAccents={[guide.accent, 'blue']}
        title={guide.title}
        description={guide.summary}
        contentClassName="max-w-4xl"
      >
        <Button variant="outline" asChild>
          <Link href="/sdk#methods">
            <ArrowLeft className={`h-4 w-4 ${buttonArrowLeftClass}`} />
            Back to SDK
          </Link>
        </Button>
        {guide.playgroundHref ? (
          <Button variant="outline" asChild>
            <Link href={guide.playgroundHref}>
              Open playground
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </SecondaryPageHeader>

      <FamilyGuideNav currentSlug={guide.slug} />

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"
      >
        <SurfacePanel radius="xl" tone="soft" padding="spacious">
          <SectionHeader
            badge="Use for"
            badgeAccent={guide.accent}
            title="When this family is the right tool"
            className="mb-0"
          />
          <BulletList items={guide.bestFor} />
        </SurfacePanel>

        <SurfacePanel radius="xl" tone="subtle" padding="spacious">
          <SectionHeader
            badge="Build path"
            badgeAccent="blue"
            title="How to wire it in an app"
            className="mb-0"
          />
          <BuildOrder guide={guide} />
        </SurfacePanel>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="mb-8 grid gap-4 lg:grid-cols-2"
      >
        <SurfacePanel radius="xl" tone="soft" padding="roomy">
          <SectionHeader
            badge={<Code2 className="h-4 w-4" />}
            badgeAccent={guide.accent}
            title="Primary methods"
            description="Reach for these SDK methods before dropping to raw actions."
            className="mb-0"
          />
          <MethodList items={guide.primaryMethods} />
        </SurfacePanel>

        <SurfacePanel radius="xl" tone="soft" padding="roomy">
          <SectionHeader
            badge={<Database className="h-4 w-4" />}
            badgeAccent="amber"
            title="Read methods"
            description="Use direct reads for fresh state and indexed reads for lists and history."
            className="mb-0"
          />
          <MethodList items={guide.readMethods} />
        </SurfacePanel>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="mb-8"
      >
        <SurfacePanel radius="xl" tone="subtle" padding="spacious">
          <SectionHeader
            badge={<Route className="h-4 w-4" />}
            badgeAccent="purple"
            title="Auth and transaction behavior"
            description="These points decide whether a user sees a wallet modal, whether a server can run the flow, and how quickly reads should update."
            className="mb-0"
          />
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {guide.transactionModel.map((item) => (
              <div
                key={item}
                className="rounded-[1rem] border border-border/35 bg-background/35 p-4 text-sm leading-6 text-muted-foreground"
              >
                <ShieldCheck className="mb-3 h-4 w-4 text-emerald-400" />
                {item}
              </div>
            ))}
          </div>
        </SurfacePanel>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Examples"
          badgeAccent={guide.accent}
          title="Copy-ready method shapes"
          description="Each example assumes the SDK client has already been initialized using the main SDK page starter."
          aside={
            <PortalBadge accent={guide.accent} size="sm">
              {guide.examples.length} guide
              {guide.examples.length === 1 ? '' : 's'}
            </PortalBadge>
          }
        />
        <div className="grid gap-4">
          {guide.examples.map((example) => (
            <SurfacePanel
              key={example.title}
              radius="xl"
              tone="soft"
              padding="roomy"
              className="min-w-0"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">
                    {example.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {example.description}
                  </p>
                </div>
                <Terminal
                  className="hidden h-5 w-5 shrink-0 md:block"
                  style={{ color: portalColors[guide.accent] }}
                />
              </div>
              <CodeBlock code={example.code} />
            </SurfacePanel>
          ))}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2 }}
        className="mb-8"
      >
        <SurfacePanel radius="xl" tone="subtle" padding="spacious">
          <SectionHeader
            badge={<ListChecks className="h-4 w-4" />}
            badgeAccent="green"
            title="Implementation notes"
            className="mb-0"
          />
          <BulletList items={guide.notes} />
        </SurfacePanel>
      </motion.section>
    </PageShell>
  );
}
