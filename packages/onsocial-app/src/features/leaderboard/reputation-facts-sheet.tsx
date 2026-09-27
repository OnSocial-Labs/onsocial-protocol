'use client';

import { useCallback, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { OsHugSheet, SheetCloseButton } from '@onsocial/ui';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import { portfolioPath } from '@/lib/overlay-routes';
import type { ProfileReputation } from '@/lib/profile-signals';
import { SHEET_Z } from '@/lib/sheet-z';

function reputationFactsCopy(reputation: ProfileReputation | null): string {
  if (!reputation) return 'Not indexed yet';
  if (reputation.rank > 0) return `Rank #${reputation.rank}`;
  return 'Protocol reputation';
}

/**
 * Short reputation facts drawer. Profile face and leaderboard rows share it.
 * `headerExtra` sits beside close (the face chart). The board omits it.
 */
export function ReputationFactsSheet({
  open,
  onClose,
  accountId,
  reputation,
  zIndex = SHEET_Z.facts,
  showProfileLink = false,
  headerExtra = null,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  reputation: ProfileReputation | null;
  zIndex?: number;
  showProfileLink?: boolean;
  headerExtra?: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      chrome="facts"
      label="Reputation"
      copy={reputationFactsCopy(reputation)}
      closeAriaLabel="Close reputation"
      backdropLabel="Close reputation"
      zIndex={zIndex}
      panelClassName="guild-facts-sheet-panel os-sheet-cap-standard"
      bodyClassName="guild-facts-sheet-body"
      headerActions={
        <div className="standing-sheet-actions standing-sheet-actions--payout">
          {headerExtra}
          <SheetCloseButton
            onClick={requestClose}
            ariaLabel="Close reputation"
          />
        </div>
      }
    >
      <div className="guild-facts">
        <ReputationBreakdownFacts
          accountId={accountId}
          reputation={reputation}
        />
        {showProfileLink && accountId ? (
          <p className="leaderboard-facts-profile-link">
            <Link
              href={portfolioPath(accountId)}
              scroll={false}
              onClick={requestClose}
            >
              View profile
            </Link>
          </p>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
