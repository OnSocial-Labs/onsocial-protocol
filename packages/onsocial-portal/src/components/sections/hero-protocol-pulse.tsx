'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { cn } from '@/lib/utils';
import {
  HERO_PROTOCOL_PULSE_METRICS,
  metricLabel,
  resolveProtocolPulseMetrics,
  type ProtocolPulseSnapshot,
} from '@/lib/protocol-pulse-metrics';

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatUpdatedAt(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Live protocol pulse';
  }

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - timestamp) / 60_000)
  );
  if (diffMinutes < 1) {
    return 'Live protocol pulse · updated just now';
  }
  if (diffMinutes < 60) {
    return `Live protocol pulse · updated ${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `Live protocol pulse · updated ${diffHours}h ago`;
}

const pulseStatValueClass =
  'text-portal-neutral font-mono text-sm font-semibold tracking-tight md:text-base';

const heroMetrics = resolveProtocolPulseMetrics(HERO_PROTOCOL_PULSE_METRICS);

export function HeroProtocolPulse() {
  const [pulse, setPulse] = useState<ProtocolPulseSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPulse() {
      try {
        const res = await fetch('/api/graph/protocol-pulse', {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Failed to load protocol pulse');
        }
        const data = (await res.json()) as ProtocolPulseSnapshot;
        if (!cancelled) {
          setPulse(data);
        }
      } catch {
        if (!cancelled) {
          setPulse(null);
        }
      }
    }

    void loadPulse();
    const interval = window.setInterval(() => {
      void loadPulse();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!pulse) {
    return null;
  }

  return (
    <div className="mx-auto mt-8 max-w-2xl rounded-[1.25rem] border border-border/40 bg-background/35 backdrop-blur-sm">
      <StatStrip columns={heroMetrics.length} mobileColumns={3}>
        {heroMetrics.map((metric, index) => {
          const raw = metric.value(pulse);
          const formatted = formatCompact(raw);
          const label = metricLabel(metric, pulse);
          const isLast = index === heroMetrics.length - 1;
          const valueNode = (
            <span className={cn('mt-1', pulseStatValueClass)}>{formatted}</span>
          );

          return (
            <StatStripCell key={metric.id} label={label} showDivider={!isLast}>
              {metric.href ? (
                <Link
                  href={metric.href}
                  className="group rounded-sm focus-visible:outline-none"
                  aria-label={
                    metric.ariaLabel?.(pulse, formatted) ??
                    `${formatted} ${label}`
                  }
                >
                  <span
                    className={cn(
                      pulseStatValueClass,
                      'transition-colors group-hover:text-[var(--portal-blue)] group-focus-visible:text-[var(--portal-blue)]'
                    )}
                  >
                    {formatted}
                  </span>
                </Link>
              ) : (
                valueNode
              )}
            </StatStripCell>
          );
        })}
      </StatStrip>
      <p className="px-4 py-3 text-center portal-eyebrow text-muted-foreground">
        {formatUpdatedAt(pulse.generatedAt)}
      </p>
    </div>
  );
}
