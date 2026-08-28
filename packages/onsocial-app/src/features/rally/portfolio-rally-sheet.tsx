'use client';

import { useCallback, useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  SheetCloseButton,
  osGestureSheetBodyClassName,
  useScrollLock,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import { CommerceSheetFooter } from '@/features/scarces/commerce-sheet-footer';
import { useRallyPlayer } from '@/features/rally/use-rally-player';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { refreshAppSocialBalanceAfterClaim } from '@/lib/app-social-balance-sync';
import { formatSocialCompact, yoctoToSocial } from '@/lib/format-social-balance';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import {
  formatRallyRankLabel,
  rallyPortalPath,
} from '@/lib/rally-season';
import {
  txToastConfirming,
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const APP_SOCIAL_SPEND_APP_ID = 'onpage';

interface PortfolioRallySheetProps {
  open: boolean;
  seasonId: string | null;
  onOpenChange: (open: boolean) => void;
  zIndex?: number;
}

function RallySheetLoadingSkeleton() {
  return (
    <div className="portfolio-boost-view" role="status" aria-label="Loading rally">
      <span className="standing-row-shimmer portfolio-boost-shimmer-eyebrow" />
      <span className="standing-row-shimmer portfolio-boost-shimmer-amount" />
      <span className="standing-row-shimmer portfolio-boost-shimmer-rate" />
    </div>
  );
}

export function PortfolioRallySheet({
  open,
  seasonId,
  onOpenChange,
  zIndex = 56,
}: PortfolioRallySheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? null;
  const panelStyle = mood
    ? supportSheetPanelStyle(mood.cssVars)
    : undefined;

  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const {
    beginSeasonJoin,
    confirmSeasonJoin,
    endSeasonJoin,
    beginSeasonClaim,
    confirmSeasonClaim,
    endSeasonClaim,
  } = useSeasonParticipation();

  const player = useRallyPlayer(seasonId, accountId, sheetOpen);
  const [action, setAction] = useState<'join' | 'collect' | 'connect' | null>(
    null
  );

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    setAction(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const signing = action === 'join' || action === 'collect';
  const shortfallYocto =
    player.joinMinYocto != null &&
    player.balanceYocto != null &&
    player.balanceYocto < player.joinMinYocto
      ? player.joinMinYocto - player.balanceYocto
      : 0n;

  async function handleConnect() {
    if (action) return;
    setAction('connect');
    try {
      await connect();
    } finally {
      setAction(null);
    }
  }

  async function handleJoin() {
    if (
      !seasonId ||
      player.joined ||
      player.joinMinYocto == null ||
      action
    ) {
      return;
    }
    if (!isConnected) {
      await handleConnect();
      return;
    }
    if (!player.hasEnoughSocial) return;

    setAction('join');
    beginSeasonJoin(seasonId);
    try {
      const { client, accountId: signingAccountId, wallet } = await getClient();
      const payload = client.socialSpend.buildSpendTransaction({
        amount: player.joinMinYocto.toString(),
        appId: APP_SOCIAL_SPEND_APP_ID,
        action: 'join_rally',
        targetType: 'rally',
        targetId: seasonId,
        seasonId,
      });
      const payment = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId: signingAccountId,
        receiverId: payload.receiverId,
        actions: payload.actions.map((step) => ({
          type: 'FunctionCall' as const,
          params: {
            methodName: step.methodName,
            args: step.args,
            gas: step.gas,
            deposit: step.deposit,
          },
        })),
      });
      const confirmed = await trackTransaction({
        txHashes: extractNearTransactionHashes(payment),
        submittedMessage: txToastPending.joiningRally(player.pageTitle),
        successMessage: txToastSuccess.joinedRally(
          player.pageTitle,
          player.profileBadgeLabel
        ),
        failureMessage: txToastError.joinRallyFailed,
      });
      if (confirmed) {
        confirmSeasonJoin(seasonId);
        await Promise.all([
          refreshAppSocialBalanceAfterClaim(),
          Promise.resolve(player.refresh()),
        ]);
      }
    } catch (cause) {
      if (!isWalletUserCancellation(cause)) {
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.joinRallyFailed,
        });
      }
    } finally {
      endSeasonJoin(seasonId);
      setAction(null);
    }
  }

  async function handleCollect() {
    const claim = player.claim;
    if (!seasonId || !claim || claim.claimed || action) return;
    if (!isConnected) {
      await handleConnect();
      return;
    }

    setAction('collect');
    beginSeasonClaim(seasonId);
    try {
      const { client, accountId: signingAccountId, wallet } = await getClient();
      const payload = client.socialSpend.buildClaimSeasonRewardTransaction({
        seasonId: claim.seasonId,
        amount: claim.amountYocto,
        proof: claim.proof,
      });
      const payment = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId: signingAccountId,
        receiverId: payload.receiverId,
        actions: payload.actions.map((step) => ({
          type: 'FunctionCall' as const,
          params: {
            methodName: step.methodName,
            args: step.args,
            gas: step.gas,
            deposit: step.deposit,
          },
        })),
      });
      const confirmed = await trackTransaction({
        txHashes: extractNearTransactionHashes(payment),
        submittedMessage: txToastConfirming.collectingSocial,
        successMessage: txToastSuccess.socialCollected,
        failureMessage: txToastError.collectSocialFailed,
      });
      if (confirmed) {
        confirmSeasonClaim(seasonId);
        await Promise.all([
          refreshAppSocialBalanceAfterClaim(),
          Promise.resolve(player.refresh()),
        ]);
      }
    } catch (cause) {
      if (!isWalletUserCancellation(cause)) {
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.collectSocialFailed,
        });
      }
    } finally {
      endSeasonClaim(seasonId);
      setAction(null);
    }
  }

  const footerState = (() => {
    if (!player.loaded) return null;
    if (!isConnected) {
      return {
        visible: true,
        primaryLabel: 'Connect',
        primaryPendingLabel: 'Connecting…',
        canSubmit: action == null,
        pending: action === 'connect',
        disabled: action != null,
        primaryType: 'button' as const,
        onPrimaryClick: () => {
          void handleConnect();
        },
      };
    }
    if (player.canCollect) {
      return {
        visible: true,
        primaryLabel: 'Collect',
        primaryPendingLabel: 'Collecting…',
        canSubmit: !signing,
        pending: action === 'collect' || player.claimPending,
        disabled: signing,
        primaryType: 'button' as const,
        onPrimaryClick: () => {
          void handleCollect();
        },
      };
    }
    if (player.phase === 'live' && !player.joined) {
      const ready =
        player.joinMinYocto != null && player.hasEnoughSocial && !signing;
      return {
        visible: true,
        primaryLabel: player.joinMinLabel
          ? `Join · ${player.joinMinLabel} SOCIAL`
          : 'Join',
        primaryPendingLabel: 'Joining…',
        canSubmit: ready,
        pending: action === 'join' || player.joinPending,
        disabled: !ready,
        primaryType: 'button' as const,
        onPrimaryClick: () => {
          void handleJoin();
        },
      };
    }
    return null;
  })();

  const rankLabel = formatRallyRankLabel(player.standing?.rank);
  const collectLabel = player.claim
    ? formatSocialCompact(player.claim.amountYocto)
    : '';

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      sizing="hug"
      moodId={mood?.id}
      panelStyle={panelStyle}
      panelClassName="profile-support-sheet-panel"
      initialDetent="full"
      peekRatio={1}
      zIndex={zIndex}
      ariaLabelledBy={titleId}
      backdropLabel={`Close ${player.pageTitle}`}
      bodyClassName={`profile-support-sheet-body ${osGestureSheetBodyClassName}`}
      header={
        <>
          <div className="standing-sheet-header portfolio-support-collect-info-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <p className="portfolio-payout-sheet-eyebrow">
                    {player.pageTitle}
                  </p>
                  <h2
                    id={titleId}
                    className="portfolio-payout-sheet-total portfolio-boost-sheet-title"
                  >
                    {!player.loaded ? (
                      <span
                        className="standing-row-shimmer portfolio-boost-shimmer-title"
                        aria-hidden
                      />
                    ) : player.canCollect ? (
                      <>
                        <span className="portfolio-boost-sheet-title-amount">
                          {collectLabel}
                        </span>
                        <span className="portfolio-payout-sheet-unit">
                          SOCIAL to collect
                        </span>
                      </>
                    ) : player.joined && rankLabel ? (
                      <>
                        <span className="portfolio-boost-sheet-title-amount">
                          {rankLabel}
                        </span>
                        <span className="portfolio-payout-sheet-unit">
                          {player.profileBadgeLabel}
                        </span>
                      </>
                    ) : (
                      <span>{player.pageTitle}</span>
                    )}
                  </h2>
                </div>
              </div>
              <div className="standing-sheet-actions standing-sheet-actions--payout">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel={`Close ${player.pageTitle}`}
                />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        footerState ? (
          <CommerceSheetFooter
            formId="portfolio-rally-sheet"
            keyboardOpen={false}
            state={footerState}
          />
        ) : undefined
      }
    >
      {!player.loaded ? (
        <RallySheetLoadingSkeleton />
      ) : (
        <div className="portfolio-boost-view">
          {player.canCollect ? (
            <p className="portfolio-boost-intro">
              Your {player.pageTitle} place is ready to collect.
            </p>
          ) : player.claim?.claimed ? (
            <p className="portfolio-boost-intro">SOCIAL collected.</p>
          ) : player.joined ? (
            <p className="portfolio-boost-intro">
              {rankLabel ? `${rankLabel} · ` : ''}
              {player.standing
                ? `${player.standing.score.toLocaleString('en-US')} points.`
                : `You're in ${player.pageTitle}.`}
            </p>
          ) : player.phase === 'live' ? (
            <p className="portfolio-boost-intro">
              {player.joinMinLabel
                ? `Spend ${player.joinMinLabel} SOCIAL to join ${player.pageTitle}.`
                : `Join ${player.pageTitle}.`}
            </p>
          ) : (
            <p className="portfolio-boost-intro">
              {player.pageTitle} is closed.
            </p>
          )}

          {isConnected &&
          player.phase === 'live' &&
          !player.joined &&
          shortfallYocto > 0n ? (
            <p className="profile-support-error" role="alert">
              Need {yoctoToSocial(shortfallYocto)} more SOCIAL.
            </p>
          ) : null}

          {seasonId ? (
            <a
              className="portfolio-rally-standings-link"
              href={rallyPortalPath(seasonId)}
              target="_blank"
              rel="noreferrer"
            >
              Full standings
            </a>
          ) : null}
        </div>
      )}
    </GlassSheet>
  );
}
