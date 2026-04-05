'use client';

import { Flame } from 'lucide-react';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';

type BoostSocialLayerProps = {
  isConnected: boolean;
  hasStake: boolean;
  userSharePct: number;
  isSoleReleaseContributor: boolean;
  commitmentMonths: number | null;
  influenceScoreDisplay: string;
  lockedAmountDisplay: string;
  dailyEstimateDisplay: string;
  weeklyReleaseDisplay: string;
  scheduledPoolDisplay: string;
  totalLockedDisplay: string;
  activeWeeklyRateBps: number | null;
};

function getCommitmentTier(months: number | null) {
  if (!months) {
    return {
      label: 'Observer',
      accent: 'slate' as const,
      summary: 'Connect and commit to enter the field.',
    };
  }

  if (months >= 48) {
    return {
      label: 'Citadel',
      accent: 'amber' as const,
      summary: 'Long-horizon presence with the strongest conviction signal.',
    };
  }

  if (months >= 24) {
    return {
      label: 'Anchor',
      accent: 'purple' as const,
      summary: 'Durable network weight aimed at long campaigns.',
    };
  }

  if (months >= 12) {
    return {
      label: 'Signal',
      accent: 'green' as const,
      summary: 'Serious commitment with visible staying power.',
    };
  }

  if (months >= 6) {
    return {
      label: 'Momentum',
      accent: 'blue' as const,
      summary: 'Mid-term positioning designed to climb quickly.',
    };
  }

  return {
    label: 'Spark',
    accent: 'slate' as const,
    summary: 'Short-form commitment suited for testing the arena.',
  };
}

export function BoostSocialLayer({
  isConnected,
  commitmentMonths,
  activeWeeklyRateBps,
}: BoostSocialLayerProps) {
  const tier = getCommitmentTier(commitmentMonths);
  const statusDescription = !isConnected
    ? 'Sign in to start boosting.'
    : 'Commit SOCIAL to enter the live standings.';

  return (
    <SurfacePanel radius="xl" tone="soft" className="p-4 md:p-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PortalBadge accent="purple" size="sm">
            Season Zero
          </PortalBadge>
          <PortalBadge accent={tier.accent} size="sm">
            {tier.label}
          </PortalBadge>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-background/30 px-3 py-1.5 text-xs text-muted-foreground">
          <Flame className="portal-amber-icon h-3 w-3" />
          <span className="font-mono font-semibold text-foreground">
            {activeWeeklyRateBps !== null
              ? `${(activeWeeklyRateBps / 100).toFixed(2)}%`
              : '—'}
          </span>
          <span>/ week</span>
        </div>
      </div>

      {/* ── Status ── */}
      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">{statusDescription}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{tier.summary}</p>
      </div>
    </SurfacePanel>
  );
}
