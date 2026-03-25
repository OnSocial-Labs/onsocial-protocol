'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Database,
  Layers,
  Palette,
  Shield,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  portalColors,
  portalFrameStyle,
  type PortalAccent,
} from '@/lib/portal-colors';

const EXPLORER_ITEMS = [
  {
    id: 'identity',
    title: 'Identity and social data',
    eyebrow: 'Shared profile',
    icon: Database,
    accent: 'blue' as PortalAccent,
    summary:
      'A person can keep one profile and one body of social data across apps, instead of starting over in each product.',
    proof: [
      'Profiles can follow the user across apps',
      'Apps can store social data with permissions',
      'The state stays readable on chain',
    ],
    metrics: [
      { label: 'Contract', value: 'core-onsocial' },
      { label: 'Focus', value: 'Profiles, posts, shared data' },
      { label: 'Model', value: 'Shared account state' },
    ],
    ctaHref: '/sdk',
    ctaLabel: 'Open SDK',
  },
  {
    id: 'groups',
    title: 'Communities and governance',
    eyebrow: 'Coordination',
    icon: Users,
    accent: 'purple' as PortalAccent,
    summary:
      'Groups, roles, and proposals live in the protocol, so community features do not have to be rebuilt from scratch in every app.',
    proof: [
      'Roles and membership controls',
      'Proposal and voting flows',
      'Reusable community state for apps',
    ],
    metrics: [
      { label: 'Contract', value: 'core-onsocial' },
      { label: 'Focus', value: 'Communities and proposals' },
      { label: 'Best fit', value: 'DAOs, clubs, creator groups' },
    ],
    ctaHref: '/partners',
    ctaLabel: 'Open partner setup',
  },
  {
    id: 'scarces',
    title: 'Scarces and commerce',
    eyebrow: 'Asset',
    icon: Palette,
    accent: 'green' as PortalAccent,
    summary:
      'Scarces are digital goods with rules around how they are issued, traded, renewed, redeemed, or revoked over time.',
    proof: [
      'Collections, offers, and auctions',
      'Renewable and redeemable assets',
      'Sales with royalty handling',
    ],
    metrics: [
      { label: 'Contract', value: 'scarces-onsocial' },
      { label: 'Focus', value: 'Digital goods and commerce' },
      { label: 'Strength', value: 'Programmable ownership rules' },
    ],
    ctaHref: '/transparency',
    ctaLabel: 'Open transparency',
  },
  {
    id: 'execution',
    title: 'Gasless execution and auth',
    eyebrow: 'Interaction',
    icon: Shield,
    accent: 'slate' as PortalAccent,
    summary:
      'Apps can choose the interaction path that fits the moment, from direct calls to sponsored actions that feel lighter for the user.',
    proof: [
      'Direct and sponsored transaction paths',
      'Relayer-backed execution flows',
      'More than one auth path for the same app',
    ],
    metrics: [
      { label: 'Relayer mode', value: 'Gasless and high availability' },
      { label: 'Focus', value: 'Lower-friction execution' },
      { label: 'Model', value: 'Gateway and relayer' },
    ],
    ctaHref: '/onapi',
    ctaLabel: 'Open OnApi',
  },
] as const;

type ExplorerItem = (typeof EXPLORER_ITEMS)[number];
type ExplorerItemId = (typeof EXPLORER_ITEMS)[number]['id'];

const SYSTEM_RAIL = [
  {
    label: 'Gateway',
    description: 'Auth, compose, public reads',
    icon: Layers,
  },
  { label: 'Relayer', description: 'Gas sponsorship and signing', icon: Zap },
  {
    label: 'Contracts',
    description: 'Protocol state and rules',
    icon: Database,
  },
] as const;

const EXPLORER_ACTIVE_SHADOWS: Record<PortalAccent, string> = {
  blue: '0 2px 4px -2px var(--portal-blue-shadow), 0 12px 24px -22px var(--portal-blue-shadow)',
  green:
    '0 2px 4px -2px var(--portal-green-shadow), 0 12px 24px -22px var(--portal-green-shadow)',
  purple:
    '0 2px 4px -2px var(--portal-purple-shadow), 0 12px 24px -22px var(--portal-purple-shadow)',
  amber:
    '0 2px 4px -2px var(--portal-amber-shadow), 0 12px 24px -22px var(--portal-amber-shadow)',
  pink: '0 2px 4px -2px rgb(236 72 153 / 0.18), 0 12px 24px -22px rgb(236 72 153 / 0.18)',
  slate:
    '0 2px 4px -2px rgb(107 114 128 / 0.18), 0 12px 24px -22px rgb(107 114 128 / 0.18)',
  red: '0 2px 4px -2px rgb(248 113 113 / 0.18), 0 12px 24px -22px rgb(248 113 113 / 0.18)',
};

const EXPLORER_PANEL_WASHES: Record<PortalAccent, string> = {
  blue: 'radial-gradient(circle at 18% 16%, rgba(96,165,250,0.16), transparent 42%)',
  green:
    'radial-gradient(circle at 18% 16%, rgba(74,222,128,0.16), transparent 42%)',
  purple:
    'radial-gradient(circle at 18% 16%, rgba(192,132,252,0.16), transparent 42%)',
  amber:
    'radial-gradient(circle at 18% 16%, rgba(251,191,36,0.16), transparent 42%)',
  pink: 'radial-gradient(circle at 18% 16%, rgba(236,72,153,0.16), transparent 42%)',
  slate:
    'radial-gradient(circle at 18% 16%, rgba(148,163,184,0.16), transparent 42%)',
  red: 'radial-gradient(circle at 18% 16%, rgba(248,113,113,0.16), transparent 42%)',
};

function ExplorerDetails({
  item,
  mobile = false,
}: {
  item: ExplorerItem;
  mobile?: boolean;
}) {
  const ActiveIcon = item.icon;

  return (
    <div
      className={cn('grid', !mobile && 'xl:grid-cols-[minmax(0,1.2fr)_320px]')}
    >
      <div
        className={cn(
          'border-border/50',
          mobile
            ? 'border-b p-4.5 sm:p-5'
            : 'border-b p-6 md:p-8 lg:p-10 xl:border-b-0 xl:border-r'
        )}
      >
        <div
          className={cn(
            'flex items-start justify-between gap-4',
            mobile ? 'mb-5' : 'mb-8'
          )}
        >
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground mb-2.5">
              {item.eyebrow}
            </p>
            <h3
              className={cn(
                'font-bold tracking-[-0.04em] mb-3',
                mobile ? 'text-[1.625rem]' : 'text-3xl md:text-4xl'
              )}
            >
              {item.title}
            </h3>
            <p
              className={cn(
                'text-muted-foreground leading-relaxed max-w-2xl',
                mobile ? 'text-sm' : 'text-base md:text-lg'
              )}
            >
              {item.summary}
            </p>
          </div>
          <div
            className={cn(
              'shrink-0 items-center justify-center border',
              mobile
                ? 'flex h-11 w-11 rounded-2xl'
                : 'hidden h-14 w-14 rounded-[1.4rem] md:flex'
            )}
            style={portalFrameStyle(item.accent)}
          >
            <ActiveIcon
              className={cn(mobile ? 'h-4.5 w-4.5' : 'h-6 w-6')}
              style={{ color: portalColors[item.accent] }}
            />
          </div>
        </div>

        <div
          className={cn(
            'grid',
            mobile ? 'gap-5' : 'gap-8 md:grid-cols-[1.2fr_0.8fr]'
          )}
        >
          <div>
            <p className="text-sm font-semibold mb-4">What it gives you</p>
            <div className={cn(mobile ? 'space-y-2.5' : 'space-y-4')}>
              {item.proof.map((proofItem, index) => (
                <div
                  key={proofItem}
                  className={cn('border-l', mobile ? 'pl-3.5' : 'pl-4')}
                  style={{ borderColor: portalColors[item.accent] }}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
                    0{index + 1}
                  </p>
                  <p
                    className={cn(
                      'font-medium leading-relaxed',
                      mobile ? 'text-[0.9375rem]' : ''
                    )}
                  >
                    {proofItem}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-4">System map</p>
            <div className="space-y-3">
              {SYSTEM_RAIL.map((rail, index) => {
                const RailIcon = rail.icon;

                return (
                  <div key={rail.label} className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex items-center justify-center border',
                        mobile
                          ? 'h-8.5 w-8.5 rounded-xl'
                          : 'h-10 w-10 rounded-2xl'
                      )}
                      style={portalFrameStyle(item.accent)}
                    >
                      <RailIcon
                        className="h-4 w-4"
                        style={{ color: portalColors[item.accent] }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{rail.label}</p>
                        {index < SYSTEM_RAIL.length - 1 && (
                          <span className="text-xs text-muted-foreground">
                            {'->'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {rail.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col justify-between',
          mobile ? 'bg-muted/20 p-4.5 sm:p-5' : 'bg-muted/20 p-6 md:p-8 lg:p-10'
        )}
      >
        <div>
          <div className={cn(mobile ? 'space-y-4' : 'space-y-5')}>
            {item.metrics.map((metric) => (
              <div
                key={metric.label}
                className={cn(
                  mobile
                    ? 'border-b border-border/40 pb-4 last:border-b-0 last:pb-0'
                    : 'pb-5 border-b border-border/40 last:border-b-0 last:pb-0'
                )}
              >
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  {metric.label}
                </p>
                <p
                  className={cn(
                    'font-semibold tracking-[-0.02em]',
                    mobile ? 'text-base' : 'text-lg'
                  )}
                >
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className={cn(mobile ? 'mt-6' : 'mt-8')}>
          <Button
            asChild
            variant="accent"
            size="lg"
            className="w-full sm:w-auto"
          >
            <Link href={item.ctaHref}>
              {item.ctaLabel}
              <ArrowUpRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProtocolExplorer() {
  const [activeId, setActiveId] = useState<ExplorerItemId>(
    EXPLORER_ITEMS[0].id
  );
  const [mobileOpenId, setMobileOpenId] = useState<ExplorerItemId | null>(
    EXPLORER_ITEMS[0].id
  );
  const [hoveredId, setHoveredId] = useState<ExplorerItemId | null>(null);
  const [pressedId, setPressedId] = useState<ExplorerItemId | null>(null);
  const activeItem =
    EXPLORER_ITEMS.find((item) => item.id === activeId) ?? EXPLORER_ITEMS[0];

  return (
    <section id="protocol" className="py-24 relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-10 h-64 pointer-events-none blur-3xl opacity-30"
        style={{
          background:
            'radial-gradient(circle at center, rgba(96,165,250,0.18), transparent 55%), radial-gradient(circle at 80% 20%, rgba(74,222,128,0.14), transparent 40%)',
        }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mb-14">
          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground mb-4">
            Protocol explorer
          </p>
          <h2 className="text-4xl md:text-6xl font-bold tracking-[-0.04em] leading-[0.95]">
            How it works
          </h2>
        </div>

        <div className="space-y-3 lg:hidden">
          {EXPLORER_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.id === mobileOpenId;
            const isHovered = item.id === hoveredId;
            const isPressed = item.id === pressedId;
            const isHighlighted = isActive || isHovered || isPressed;

            return (
              <motion.div
                key={item.id}
                layout
                className="space-y-3 scroll-mt-24"
              >
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  whileTap={{ scale: 0.992 }}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() =>
                    setHoveredId((current) =>
                      current === item.id ? null : current
                    )
                  }
                  onPointerDown={() => setPressedId(item.id)}
                  onPointerUp={() =>
                    setPressedId((current) =>
                      current === item.id ? null : current
                    )
                  }
                  onPointerCancel={() =>
                    setPressedId((current) =>
                      current === item.id ? null : current
                    )
                  }
                  onFocus={() => setHoveredId(item.id)}
                  onBlur={() => {
                    setHoveredId((current) =>
                      current === item.id ? null : current
                    );
                    setPressedId((current) =>
                      current === item.id ? null : current
                    );
                  }}
                  onClick={(event) => {
                    setActiveId(item.id);
                    setMobileOpenId((current) =>
                      current === item.id ? null : item.id
                    );
                    setPressedId(null);
                    event.currentTarget.blur();
                  }}
                  aria-expanded={isActive}
                  className={cn(
                    'w-full rounded-[1.75rem] px-3.5 py-3.5 text-left backdrop-blur-sm transition-all sm:px-4 sm:py-4',
                    'bg-background/55',
                    !isHighlighted && 'active:bg-background/65'
                  )}
                  style={
                    isHighlighted
                      ? {
                          backgroundColor: 'hsl(var(--background) / 0.55)',
                          boxShadow: EXPLORER_ACTIVE_SHADOWS[item.accent],
                        }
                      : undefined
                  }
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl border sm:h-10 sm:w-10"
                      style={portalFrameStyle(item.accent)}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{ color: portalColors[item.accent] }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
                        {item.eyebrow}
                      </p>
                      <p className="text-[0.9375rem] font-semibold tracking-[-0.02em] sm:text-base">
                        {item.title}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 ease-out',
                        isHighlighted && 'text-foreground',
                        isHovered && !isActive && 'translate-y-0.5',
                        isActive && 'rotate-180',
                        isHovered && isActive && '-translate-y-0.5'
                      )}
                    />
                  </div>
                </motion.button>

                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.div
                      key={`${item.id}-details`}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        duration: 0.34,
                        ease: [0.25, 0.1, 0.25, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <motion.div
                        initial={{ opacity: 0.92 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0.92 }}
                        transition={{ duration: 0.24, ease: 'easeOut' }}
                        className="relative overflow-hidden rounded-[2rem] bg-background/65 backdrop-blur-sm"
                      >
                        <div
                          className="pointer-events-none absolute inset-0 opacity-60"
                          style={{
                            background: EXPLORER_PANEL_WASHES[item.accent],
                          }}
                        />
                        <div className="relative z-10">
                          <ExplorerDetails item={item} mobile />
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <div className="hidden items-start gap-8 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 space-y-3">
            {EXPLORER_ITEMS.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;
              const isHovered = item.id === hoveredId;
              const isHighlighted = isActive || isHovered;

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  onClick={() => setActiveId(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() =>
                    setHoveredId((current) =>
                      current === item.id ? null : current
                    )
                  }
                  onFocus={() => setHoveredId(item.id)}
                  onBlur={() =>
                    setHoveredId((current) =>
                      current === item.id ? null : current
                    )
                  }
                  className={cn(
                    'w-full rounded-[1.75rem] px-4 py-4 text-left backdrop-blur-sm transition-all',
                    'bg-background/55',
                    !isHighlighted && 'hover:bg-background/65'
                  )}
                  style={
                    isHighlighted
                      ? {
                          backgroundColor: 'hsl(var(--background) / 0.55)',
                          boxShadow: EXPLORER_ACTIVE_SHADOWS[item.accent],
                        }
                      : undefined
                  }
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border"
                      style={portalFrameStyle(item.accent)}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{ color: portalColors[item.accent] }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
                        {item.eyebrow}
                      </p>
                      <p className="font-semibold tracking-[-0.02em]">
                        {item.title}
                      </p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 ease-out',
                        isHovered && 'translate-x-1 text-foreground',
                        isActive && 'translate-x-0.5 text-foreground'
                      )}
                    />
                  </div>
                </motion.button>
              );
            })}
          </aside>

          <motion.div
            layout
            className="relative overflow-hidden rounded-[2rem] bg-background/65 backdrop-blur-sm"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: EXPLORER_PANEL_WASHES[activeItem.accent] }}
            />
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeItem.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="relative z-10"
              >
                <ExplorerDetails item={activeItem} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
