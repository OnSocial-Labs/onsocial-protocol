'use client';

import { Gift } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { fetchJoinRallyRouting } from '@/lib/join-rally-routing';
import { cn } from '@/lib/utils';

export function SeasonZeroRewardsPanel({ className }: { className?: string }) {
  const [joinMinLabel, setJoinMinLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    void fetchJoinRallyRouting()
      .then((routing) => {
        if (cancelled) return;
        setJoinMinLabel(routing?.joinMinAmountSocialLabel ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setJoinMinLabel(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const minLabel = loading ? '…' : (joinMinLabel ?? 'Unavailable');

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
            The pool is all SOCIAL from rally joins ({minLabel} minimum from
            chain). After the season ends, eligible joiners claim from that pool
            — nothing is airdropped automatically.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <span className="text-foreground">70%</span> shared equally among
              everyone who joined at the on-chain minimum
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
