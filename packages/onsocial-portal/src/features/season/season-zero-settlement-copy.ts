import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import type { SeasonZeroSettlementSummary } from '@/features/season/season-zero-types';

function formatWinnerCount(count: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    count
  );
}

/** Context line for the rally collect row after settlement is published. */
export function seasonSettlementPoolSummary(
  settlement: SeasonZeroSettlementSummary
): string {
  const winners = formatWinnerCount(settlement.rewardCount);
  const allocated = formatGenesisSocialBalanceDisplay(
    settlement.totalAmountYocto
  );
  return `${winners} winner${settlement.rewardCount === 1 ? '' : 's'} · ${allocated} SOCIAL allocated`;
}
