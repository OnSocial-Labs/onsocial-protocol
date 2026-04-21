'use client';

import { useEffect, useState } from 'react';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { ACTIVE_API_URL } from '@/lib/portal-config';

interface ProtocolPulse {
  generatedAt: string;
  windowHours: number;
  totals: {
    profiles: number;
    groups: number;
  };
  recent24h: {
    posts: number;
  };
}

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

export function HeroProtocolPulse() {
  const [pulse, setPulse] = useState<ProtocolPulse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPulse() {
      try {
        const res = await fetch(`${ACTIVE_API_URL}/graph/protocol-pulse`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Failed to load protocol pulse');
        }
        const data = (await res.json()) as ProtocolPulse;
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
      <StatStrip columns={3} mobileColumns={3}>
        <StatStripCell
          label="Profiles"
          value={formatCompact(pulse.totals.profiles)}
          showDivider
        />
        <StatStripCell
          label={`Posts ${pulse.windowHours}h`}
          value={formatCompact(pulse.recent24h.posts)}
          showDivider
        />
        <StatStripCell
          label="Groups"
          value={formatCompact(pulse.totals.groups)}
        />
      </StatStrip>
      <p className="px-4 py-3 text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {formatUpdatedAt(pulse.generatedAt)}
      </p>
    </div>
  );
}
