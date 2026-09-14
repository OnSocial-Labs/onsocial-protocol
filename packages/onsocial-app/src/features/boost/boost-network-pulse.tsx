'use client';

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
      {loading ? (
        <span
          className="standing-row-shimmer portfolio-boost-shimmer-network"
          aria-hidden
        />
      ) : (
        <span className="portfolio-boost-network-value">{value}</span>
      )}
    </div>
  );
}

export function BoostNetworkPulse({
  boosterCount,
  totalLockedYocto,
  scheduledPoolYocto,
  activeWeeklyRateBps,
  loading = false,
}: {
  boosterCount: number | null;
  totalLockedYocto: string | null;
  scheduledPoolYocto: string | null;
  activeWeeklyRateBps: number | null;
  loading?: boolean;
}) {
  return (
    <section className="portfolio-boost-network" aria-label="Network">
      <PulseItem
        label="Boosters"
        value={formatBoostBoosterCount(boosterCount)}
        loading={loading}
      />
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
    </section>
  );
}
