'use client';

import Link from 'next/link';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import { TRANSPARENCY_ACTION_LINKS } from '@/features/transparency/transparency-constants';
import { TRANSPARENCY_PANEL_DIVIDER_CLASS, TRANSPARENCY_PANEL_PADDING_CLASS } from '@/features/transparency/transparency-page-column';
import { cn } from '@/lib/utils';

export function TransparencyActionLinks({ className }: { className?: string }) {
  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="none"
      className={cn(TRANSPARENCY_PANEL_PADDING_CLASS, className)}
    >
      <BoostPanelSectionTitle align="center">Use SOCIAL</BoostPanelSectionTitle>

      <div className={cn('divide-y divide-fade-detail', TRANSPARENCY_PANEL_DIVIDER_CLASS)}>
        {TRANSPARENCY_ACTION_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex min-h-10 items-center justify-between gap-3 py-2.5 first:pt-3 last:pb-0 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium tracking-tight text-foreground/90 transition-colors group-hover:text-foreground">
                {link.label}
              </span>
              <span className="block portal-type-micro text-muted-foreground/75">
                {link.hint}
              </span>
            </span>
            <ProtocolMotionArrow className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          </Link>
        ))}
      </div>
    </SurfacePanel>
  );
}
