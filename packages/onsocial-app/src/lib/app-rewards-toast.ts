import type { PlatformRewardCreditEvent } from '@onsocial/sdk';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { nearExplorerTxHref } from '@/lib/app-config';
import {
  compressAppRewardBurstReasons,
  formatShortBurstReason,
  resolveBurstDisplayAmount,
  shouldShowBurstCelebration,
} from '@/lib/app-reward-burst-copy';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { txToastSuccess } from '@/lib/transaction-toast-copy';

/**
 * Hold the reward-toast gate slightly past the success dismiss (3500ms) so a
 * queued credit flush does not replace a still-visible collect / credit toast.
 */
export const APP_REWARD_TOAST_HOLD_MS = 3600;

function lastCreditTxHash(
  events: PlatformRewardCreditEvent[]
): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const hash = events[i]?.txHash?.trim();
    if (hash) return hash;
  }
  return null;
}

/**
 * Build the global success toast for a passive platform-reward credit burst.
 * Returns null when there is nothing to celebrate.
 */
export function buildAppRewardCreditToast(
  events: PlatformRewardCreditEvent[]
): TransactionFeedback | null {
  if (!shouldShowBurstCelebration(events)) {
    return null;
  }

  const displayTotal = resolveBurstDisplayAmount(events);
  if (displayTotal <= 0n) {
    return null;
  }

  const amountLabel = formatSocialCompact(displayTotal.toString());
  const reason = formatShortBurstReason(compressAppRewardBurstReasons(events));

  return {
    type: 'success',
    msg: txToastSuccess.rewardCredited(amountLabel, reason),
    explorerHref: nearExplorerTxHref(lastCreditTxHash(events)),
  };
}

/** Success toast after Collect SOCIAL lands (with or without a tx hash). */
export function buildAppRewardCollectToast(
  claimedYocto: bigint,
  txHash?: string | null
): TransactionFeedback | null {
  if (claimedYocto <= 0n) {
    return null;
  }

  const amountLabel = formatSocialCompact(claimedYocto.toString());
  return {
    type: 'success',
    msg: txToastSuccess.rewardsCollected(amountLabel),
    explorerHref: nearExplorerTxHref(txHash),
  };
}

/**
 * Inline Activity caption while the account sheet is open (no global toast).
 * Omits "SOCIAL" — the wallet zone already frames the unit.
 */
export function buildAppRewardCreditCaption(
  events: PlatformRewardCreditEvent[]
): string | null {
  if (!shouldShowBurstCelebration(events)) {
    return null;
  }

  const displayTotal = resolveBurstDisplayAmount(events);
  if (displayTotal <= 0n) {
    return null;
  }

  const amountLabel = formatSocialCompact(displayTotal.toString());
  const reason = formatShortBurstReason(compressAppRewardBurstReasons(events));
  return reason?.trim()
    ? `+${amountLabel} · ${reason.trim()}`
    : `+${amountLabel}`;
}
