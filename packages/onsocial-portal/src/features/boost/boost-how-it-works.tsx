'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { portalCollapseMotion } from '@/features/governance/governance-motion';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import { BOOST_CONTRACT } from '@/lib/near-rpc';
import { BOOST_PANEL_PADDING_CLASS } from '@/features/boost/boost-page-column';
import { cn } from '@/lib/utils';

const TOGGLE_CLASS =
  'group flex w-full min-h-9 items-center justify-between gap-3 rounded-[0.75rem] px-1 py-1.5 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60';

const MECHANICS = [
  {
    title: 'Influence',
    description:
      'One lock period (1–48 mo). Amount and bonus set your influence.',
  },
  {
    title: 'Weekly flow',
    description:
      'Pool releases at the network rate. Collect anytime; unlock when eligible.',
  },
  {
    title: 'Pool',
    description:
      'Network fees fund releases. Your slice tracks influence, not spend volume.',
  },
  {
    title: 'Adding more',
    description:
      'Same period only. More SOCIAL keeps the term; timer resets from today.',
  },
] as const;

function MechanicLine({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="py-2 md:py-2.5">
      <p className="portal-type-micro text-muted-foreground/55">{title}</p>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function BoostHowItWorks({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <SurfacePanel
      radius="xl"
      tone="subtle"
      padding="none"
      className={cn(BOOST_PANEL_PADDING_CLASS, className)}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={TOGGLE_CLASS}
      >
        <span className="portal-eyebrow-wide text-muted-foreground transition-colors group-hover:text-foreground/80">
          How it works
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground/80',
            open && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="boost-how-it-works"
            {...portalCollapseMotion}
            className="overflow-hidden"
          >
            <div className="divide-y divide-fade-detail border-t border-fade-detail">
              {MECHANICS.map((item) => (
                <MechanicLine
                  key={item.title}
                  title={item.title}
                  description={item.description}
                />
              ))}
              <div className="flex justify-center py-2 md:py-2.5">
                <a
                  href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${BOOST_CONTRACT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1 portal-type-micro text-muted-foreground transition-colors hover:text-foreground"
                >
                  Boost contract
                  <ProtocolMotionArrow className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </SurfacePanel>
  );
}
