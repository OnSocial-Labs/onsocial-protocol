'use client';

import { Divider } from '@onsocial/ui';
import { ListLoadError } from '@/components/panels/list-load-error';
import {
  formatBoostBoosterCount,
  formatBoostNetworkAmount,
  formatBoostWeeklyRateBps,
} from '@/features/boost/boost-position';

function PulseItem({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="portfolio-boost-network-item">
      <span className="portfolio-boost-network-label">{label}</span>
      <span className="portfolio-boost-network-value-seat">
        {loading ? (
          <span
            className="standing-row-shimmer portfolio-boost-shimmer-network"
            aria-hidden
          />
        ) : (
          <span className="portfolio-boost-network-value">{value}</span>
        )}
      </span>
    </div>
  );
}

export function BoostNetworkPulse({
  boosterCount,
  totalLockedYocto,
  scheduledPoolYocto,
  activeWeeklyRateBps,
  loading = false,
  error = false,
  onRetry,
}: {
  boosterCount: number | null;
  totalLockedYocto: string | null;
  scheduledPoolYocto: string | null;
  activeWeeklyRateBps: number | null;
  loading?: boolean;
  /** Stats read failed. Boosters stays on its own result. */
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="portfolio-boost-network-block">
      <Divider variant="item" />
      <section className="portfolio-boost-network" aria-label="Network">
        <PulseItem
          label="Boosters"
          value={formatBoostBoosterCount(boosterCount)}
          loading={loading}
        />
        {error && onRetry ? (
          <div className="portfolio-boost-network-stats">
            <ListLoadError
              message="Couldn’t load network stats."
              onRetry={onRetry}
            />
          </div>
        ) : (
          <>
            <PulseItem
              label="Locked"
              value={formatBoostNetworkAmount(totalLockedYocto)}
              loading={loading}
            />
            <PulseItem
              label="Pool"
              value={formatBoostNetworkAmount(scheduledPoolYocto)}
              loading={loading}
            />
            <PulseItem
              label="Rate"
              value={formatBoostWeeklyRateBps(activeWeeklyRateBps)}
              loading={loading}
            />
          </>
        )}
      </section>
    </div>
  );
}
