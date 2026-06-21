import { PageShell } from '@/components/layout/page-shell';
import { TransparencyActionLinks } from '@/features/transparency/transparency-action-links';
import { TransparencyAllocationPanel } from '@/features/transparency/transparency-allocation-panel';
import { TRANSPARENCY_NETWORK } from '@/features/transparency/transparency-constants';
import { TransparencyLiquidityPanel } from '@/features/transparency/transparency-liquidity-panel';
import { TransparencyPageColumn } from '@/features/transparency/transparency-page-column';
import { TransparencyPageIntro } from '@/features/transparency/transparency-page-intro';
import { TransparencyProtocolContracts } from '@/features/transparency/transparency-protocol-contracts';
import { TransparencySupplyPulse } from '@/features/transparency/transparency-supply-pulse';

const EMPTY_DISTRIBUTION = [
  {
    label: 'Reward Pool',
    account: 'rewards',
    accent: 'purple' as const,
    balance: null,
    balanceDisplay: '—',
    pctOfSupplyDisplay: '0.0',
    pctOfSupply: 0,
  },
];

export function TransparencyPageLoadingShell() {
  return (
    <PageShell className="max-w-6xl">
      <TransparencyPageColumn>
        <div className="max-md:hidden">
          <TransparencyPageIntro />
        </div>

        <TransparencySupplyPulse
          tokenIconSrc={null}
          tokenSymbol="SOCIAL"
          supplyDisplay={null}
          burnedDisplay={null}
          holderCount={null}
          totalLockedYocto="0"
          supplyLoading
          holdersLoading
          lockedLoading
        />

        <TransparencyAllocationPanel
          barDistribution={EMPTY_DISTRIBUTION}
          isTrackedBalanceLoaded={() => false}
          allocationLoaded={false}
          loading
        />

        {TRANSPARENCY_NETWORK === 'mainnet' ? (
          <TransparencyLiquidityPanel
            pools={[]}
            totalSocialInPools={0n}
            tokenIconSrc={null}
            tokenSymbol="SOCIAL"
            loading
          />
        ) : null}

        <TransparencyActionLinks />

        <TransparencyProtocolContracts />
      </TransparencyPageColumn>
    </PageShell>
  );
}
