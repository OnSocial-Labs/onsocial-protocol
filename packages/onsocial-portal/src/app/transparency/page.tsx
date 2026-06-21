'use client';

import { useRef } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { TransparencyActionLinks } from '@/features/transparency/transparency-action-links';
import { TransparencyAllocationPanel } from '@/features/transparency/transparency-allocation-panel';
import { TransparencyLiquidityPanel } from '@/features/transparency/transparency-liquidity-panel';
import { TransparencyPageColumn } from '@/features/transparency/transparency-page-column';
import { TransparencyPageIntro } from '@/features/transparency/transparency-page-intro';
import { TransparencyProtocolContracts } from '@/features/transparency/transparency-protocol-contracts';
import { TransparencySupplyPulse } from '@/features/transparency/transparency-supply-pulse';
import { useTransparencyData } from '@/features/transparency/use-transparency-data';

export default function TransparencyPage() {
  const hasSupplyLoadedRef = useRef(false);
  const hasHoldersLoadedRef = useRef(false);
  const hasAllocationLoadedRef = useRef(false);
  const hasLiquidityLoadedRef = useRef(false);
  const hasBoostStatsLoadedRef = useRef(false);

  const {
    tokenIconSrc,
    setTokenIconSrc,
    tokenSymbol,
    holderCount,
    holderCountLoaded,
    currentSupplyDisplay,
    burnedDisplay,
    supplyLoaded,
    barDistribution,
    isTrackedBalanceLoaded,
    allocationLoaded,
    marketLiquidityPools,
    marketLiquidityLoaded,
    totalSocialInPools,
    totalLockedYocto,
    boostStatsLoaded,
  } = useTransparencyData();

  if (supplyLoaded) {
    hasSupplyLoadedRef.current = true;
  }
  if (holderCountLoaded) {
    hasHoldersLoadedRef.current = true;
  }
  if (allocationLoaded) {
    hasAllocationLoadedRef.current = true;
  }
  if (marketLiquidityLoaded) {
    hasLiquidityLoadedRef.current = true;
  }
  if (boostStatsLoaded) {
    hasBoostStatsLoadedRef.current = true;
  }

  const showSupplySkeleton = !hasSupplyLoadedRef.current && !supplyLoaded;
  const showHoldersSkeleton =
    !hasHoldersLoadedRef.current && !holderCountLoaded;
  const showAllocationSkeleton =
    !hasAllocationLoadedRef.current && !allocationLoaded;
  const showLiquiditySkeleton =
    !hasLiquidityLoadedRef.current && !marketLiquidityLoaded;
  const showLockedSkeleton =
    !hasBoostStatsLoadedRef.current && !boostStatsLoaded;

  return (
    <PageShell className="max-w-6xl">
      <TransparencyPageColumn>
        <div className="max-md:hidden">
          <TransparencyPageIntro />
        </div>

        <TransparencySupplyPulse
          tokenIconSrc={tokenIconSrc}
          tokenSymbol={tokenSymbol}
          onTokenIconError={() => setTokenIconSrc(null)}
          supplyDisplay={currentSupplyDisplay}
          burnedDisplay={burnedDisplay}
          holderCount={holderCount}
          totalLockedYocto={totalLockedYocto}
          supplyLoading={showSupplySkeleton}
          holdersLoading={showHoldersSkeleton}
          lockedLoading={showLockedSkeleton}
        />

        <TransparencyAllocationPanel
          barDistribution={barDistribution}
          isTrackedBalanceLoaded={isTrackedBalanceLoaded}
          allocationLoaded={allocationLoaded}
          loading={showAllocationSkeleton}
        />

        <TransparencyLiquidityPanel
          pools={marketLiquidityPools}
          totalSocialInPools={totalSocialInPools}
          tokenIconSrc={tokenIconSrc}
          tokenSymbol={tokenSymbol}
          loading={showLiquiditySkeleton}
        />

        <TransparencyActionLinks />

        <TransparencyProtocolContracts />
      </TransparencyPageColumn>
    </PageShell>
  );
}
