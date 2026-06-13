'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PeriodProgressBarProps = {
  startIso: string;
  endIso: string;
  accentColor: string;
  leftLabel: ReactNode;
  rightLabel: ReactNode;
  nearEndThreshold?: number;
  className?: string;
};

function computeProgress(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const total = end - start;
  const elapsed = Math.max(0, Date.now() - start);
  return total > 0 ? Math.min(elapsed / total, 1) : 0;
}

export function PeriodProgressBar({
  startIso,
  endIso,
  accentColor,
  leftLabel,
  rightLabel,
  nearEndThreshold = 0.75,
  className,
}: PeriodProgressBarProps) {
  const [pct, setPct] = useState(() => computeProgress(startIso, endIso));

  useEffect(() => {
    const id = setInterval(
      () => setPct(computeProgress(startIso, endIso)),
      60_000
    );
    return () => clearInterval(id);
  }, [startIso, endIso]);

  const nearEnd = pct >= nearEndThreshold;

  return (
    <div className={cn(className)}>
      <div className="h-px w-full bg-border/40">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${Math.max(pct * 100, 1)}%`,
            backgroundColor: nearEnd ? accentColor : 'var(--muted-foreground)',
            opacity: nearEnd ? 0.7 : 0.3,
          }}
        />
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-muted-foreground/70">{leftLabel}</span>
        <span className="portal-type-label font-medium tracking-[0.08em] text-muted-foreground/50">
          {rightLabel}
        </span>
      </div>
    </div>
  );
}
