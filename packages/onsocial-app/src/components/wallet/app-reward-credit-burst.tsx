'use client';

import { useEffect } from 'react';
import { GiftIcon } from '@onsocial/ui';
import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useAppRewards } from '@/contexts/app-rewards-context';
import { formatShortBurstReason } from '@/lib/app-reward-burst-copy';
import { formatSocialCompact } from '@/lib/format-social-balance';

/** Lifecycle duration + start delay (matches CSS --burst-duration / --burst-delay). */
const BURST_ANIMATION_MS = 2_800;
const BURST_DELAY_MS = 500;
const BURST_VISIBLE_MS = BURST_DELAY_MS + BURST_ANIMATION_MS;

function RewardCelebrationPill({
  amountYocto,
  reasons,
}: {
  amountYocto: bigint;
  reasons: string[];
}) {
  const amountLabel = formatSocialCompact(amountYocto.toString());
  const shortReason = formatShortBurstReason(reasons);

  return (
    <div className="app-reward-credit-burst-pill">
      <div className="app-reward-credit-burst-row">
        <GiftIcon aria-hidden className="app-reward-credit-burst-icon" />
        <span className="app-reward-credit-burst-amount">+{amountLabel}</span>
        <span className="app-reward-credit-burst-unit">SOCIAL</span>
      </div>
      {shortReason ? (
        <p className="app-reward-credit-burst-reason">{shortReason}</p>
      ) : null}
    </div>
  );
}

/** Borderless celebration pill — amount + short reason, floats above the dock. */
export function AppRewardCreditBurst() {
  const { creditBurst, dismissCreditBurst } = useAppRewards();
  const { open: accountSheetOpen } = useAppAccountSheet();

  useEffect(() => {
    if (!creditBurst) {
      return;
    }

    const timer = window.setTimeout(() => {
      dismissCreditBurst();
    }, BURST_VISIBLE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [creditBurst?.id, dismissCreditBurst]);

  if (!creditBurst || accountSheetOpen) {
    return null;
  }

  const amountLabel = formatSocialCompact(creditBurst.amountYocto.toString());
  const shortReason = formatShortBurstReason(creditBurst.reasons);
  const statusLabel = shortReason
    ? `+${amountLabel} SOCIAL — ${shortReason}`
    : `+${amountLabel} SOCIAL`;

  return (
    <div
      className="app-reward-credit-burst"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={statusLabel}
    >
      <div className="app-reward-credit-burst-stage">
        <RewardCelebrationPill
          amountYocto={creditBurst.amountYocto}
          reasons={creditBurst.reasons}
        />
      </div>
    </div>
  );
}
