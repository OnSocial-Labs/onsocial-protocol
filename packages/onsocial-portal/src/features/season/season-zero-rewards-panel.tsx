'use client';

import { Gift } from 'lucide-react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { GENESIS_RALLY_JOIN_SOCIAL_LABEL } from '@/lib/genesis-season';
import { cn } from '@/lib/utils';

export function SeasonZeroRewardsPanel({ className }: { className?: string }) {
  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="snug"
      className={cn('border-border/40', className)}
    >
      <div className="flex items-start gap-3">
        <Gift className="portal-gold-icon mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-2 text-sm">
          <h2 className="font-semibold tracking-tight text-foreground">
            How rewards work
          </h2>
          <p className="text-muted-foreground">
            The pool is all SOCIAL from Genesis Rally joins (
            {GENESIS_RALLY_JOIN_SOCIAL_LABEL} minimum). After the season ends,
            eligible joiners claim from that pool — nothing is airdropped
            automatically.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <span className="text-foreground">70%</span> shared equally among
              everyone who joined with {GENESIS_RALLY_JOIN_SOCIAL_LABEL} SOCIAL
            </li>
            <li>
              <span className="text-foreground">30%</span> split by activity —
              points you earned above the 1,000 join baseline
            </li>
            <li>
              Stay active across UTC days; daily caps mean steady play beats one
              burst day
            </li>
            <li>
              When claims open, connect the same wallet and claim your SOCIAL on
              this page
            </li>
          </ul>
        </div>
      </div>
    </SurfacePanel>
  );
}
