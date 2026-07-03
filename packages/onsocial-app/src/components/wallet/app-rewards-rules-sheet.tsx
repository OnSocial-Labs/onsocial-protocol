'use client';

import { useCallback, useState } from 'react';
import { Divider, GlassSheet, SheetCloseButton } from '@onsocial/ui';
import { AccountClaimMetricRow } from '@/components/wallet/account-card-parts';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import {
  APP_SOCIAL_HELP_DETAIL,
  APP_SOCIAL_HELP_SUMMARY,
  APP_SOCIAL_HELP_TITLE,
} from '@/lib/app-reward-constants';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { useAppRewardsOptional } from '@/contexts/app-rewards-context';

interface AppRewardsRulesSheetProps {
  open: boolean;
  accountId: string;
  onClose: () => void;
}

export function AppRewardsRulesSheet({
  open,
  accountId,
  onClose,
}: AppRewardsRulesSheetProps) {
  const [closing, setClosing] = useState(false);
  const rewards = useAppRewardsOptional();
  const sheetOpen = open && !closing;

  useScrollLock(sheetOpen || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const claimableLabel = formatSocialCompact(rewards?.claimableYocto ?? 0n);
  const headerHint = rewards?.canClaim
    ? `${claimableLabel} SOCIAL ready to collect`
    : `${claimableLabel} SOCIAL stacked`;

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      initialDetent="full"
      zIndex={57}
      presentation="swap"
      ariaLabelledBy="app-rewards-rules-title"
      backdropLabel="Close"
      panelClassName="account-rewards-rules-panel"
      bodyClassName="account-rewards-rules-body"
      header={
        <>
          <div className="standing-sheet-header account-rewards-rules-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <h2
                  id="app-rewards-rules-title"
                  className="standing-sheet-subject-name"
                >
                  {APP_SOCIAL_HELP_TITLE}
                </h2>
                <p className="account-drawer-handle">{headerHint}</p>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={requestClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="account-rewards-rules-sheet">
        <section
          className="account-card-wallet-zone account-rewards-rules-wallet"
          aria-label="Collect progress"
        >
          <AccountClaimMetricRow showCaption={false} />
        </section>

        <div
          className="account-rewards-rules-copy"
          role="group"
          aria-label={APP_SOCIAL_HELP_TITLE}
        >
          <p className="account-rewards-rules-summary">{APP_SOCIAL_HELP_SUMMARY}</p>
          <p className="account-rewards-rules-detail">{APP_SOCIAL_HELP_DETAIL}</p>
          <p className="account-rewards-rules-meta">@{accountId}</p>
        </div>
      </div>
    </GlassSheet>
  );
}
