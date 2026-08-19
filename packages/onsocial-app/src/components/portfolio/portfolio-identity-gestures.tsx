'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { PortfolioOwnerPayoutMarks } from '@/components/portfolio/portfolio-owner-payout-marks';
import { EndorseComposeSheet } from '@/components/panels/endorse-compose-sheet';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { DmComposeSheet } from '@/features/messages/dm-compose-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerMute } from '@/hooks/use-viewer-mute';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { useNotificationsUnreadCount } from '@/components/providers/notifications-host';
import { accountIdsEqual } from '@/lib/account-match';
import { displayName } from '@/lib/profile-display';
import type { ResolvedMood } from '@/lib/moods/types';
import { isBlockEitherWay, isViewerMuting } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation, formatStandingActionError } from '@/lib/wallet-errors';
import { notificationsPath } from '@/lib/app-routes';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';

interface PortfolioIdentityGesturesProps {
  pageAccountId: string;
  profileName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  mood?: ResolvedMood | null;
  /** DAO org face — Stand · Support (no Endorse / Message). */
  isDao?: boolean;
}

/**
 * Face gesture slot under bio.
 * Connected visitor: Stand · Endorse · Support · Message.
 * DAO visitor: Stand · Support.
 * Owner: payout marks + Activity. DAO self: hidden (org tools row owns Manage).
 * Mute/block live on post overflow and wallet lists — not here.
 */
export function PortfolioIdentityGestures({
  pageAccountId,
  profileName,
  bio,
  avatarUrl,
  mood = null,
  isDao = false,
}: PortfolioIdentityGesturesProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { viewerStanding, theyStandWithViewer, isLoading } = useViewerRelationship(pageAccountId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(pageAccountId);
  const { isMuting } = useViewerMute();
  const activityUnread = useNotificationsUnreadCount();
  const [supportOpen, setSupportOpen] = useState(false);
  const [endorseOpen, setEndorseOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const router = useRouter();

  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, pageAccountId);
  const pending = isStandingPendingForTarget(pageAccountId);
  const label = displayName(pageAccountId, profileName ?? undefined);
  const blockEitherWay = isBlockEitherWay(pageAccountId);
  const viewerMuted = isMuting(pageAccountId) || isViewerMuting(pageAccountId);
  const messagingBlocked = blockEitherWay || viewerMuted;

  if (!isConnected || !viewerAccountId) {
    return null;
  }

  if (isSelf) {
    if (isDao) {
      return null;
    }
    return (
      <div className="portfolio-identity-gestures">
        <PortfolioOwnerPayoutMarks accountId={pageAccountId} />
        <button
          type="button"
          className="portfolio-identity-gesture portfolio-identity-gesture--message"
          onClick={() => router.push(notificationsPath())}
        >
          Activity
          {activityUnread > 0 ? (
            <span
              className="messages-nav-badge"
              aria-label={`${activityUnread} unread`}
            >
              {activityUnread > 9 ? '9+' : activityUnread}
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  async function handleStandToggle() {
    if (pending) return;
    if (blockEitherWay) {
      setTxResult({
        type: 'error',
        msg: 'Standing is unavailable while a block is in place.',
      });
      return;
    }
    if (isDao) {
      rememberDaoStandingTarget(pageAccountId);
    }
    try {
      await updateStanding(
        {
          accountId: pageAccountId,
          name: profileName?.trim() || null,
          bio: bio ?? null,
          avatarUrl: avatarUrl ?? null,
          isDao: isDao || undefined,
          theyStandWithViewer,
        },
        !viewerStanding
      );
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg: formatStandingActionError(error),
      });
    }
  }

  return (
    <div className="portfolio-identity-gestures">
      {isLoading ? (
        <div
          className="portfolio-identity-gesture-row portfolio-identity-gesture-row--loading"
          aria-hidden
        >
          {Array.from({ length: isDao ? 2 : 4 }, (_, index) => (
            <span key={index}>
              {index > 0 ? (
                <span className="portfolio-identity-gesture-sep" aria-hidden />
              ) : null}
              <span className="portfolio-identity-gesture-shimmer" />
            </span>
          ))}
        </div>
      ) : (
        <div
          className="portfolio-identity-gesture-row"
          role="group"
          aria-label="Social gestures"
        >
          <button
            type="button"
            className={`portfolio-identity-gesture portfolio-identity-gesture--stand group${
              viewerStanding ? ' is-standing' : ''
            }`}
            disabled={pending || blockEitherWay}
            onClick={() => void handleStandToggle()}
            aria-label={
              viewerStanding ? `Step back from ${label}` : `Stand with ${label}`
            }
          >
            <StandingToggle active={viewerStanding} pending={pending} />
          </button>

          {!isDao ? (
            <>
              <span className="portfolio-identity-gesture-sep" aria-hidden>
                ·
              </span>

              <button
                type="button"
                className="portfolio-identity-gesture portfolio-identity-gesture--endorse group"
                onClick={() => setEndorseOpen(true)}
                aria-label={`Endorse ${label}`}
              >
                <span className="signal-group signal-group-endorse" aria-hidden>
                  <ProtocolMotionArrow className="signal-metric-arrow" />
                </span>
                Endorse
              </button>
            </>
          ) : null}

          <span className="portfolio-identity-gesture-sep" aria-hidden>
            ·
          </span>

          <button
            type="button"
            className="portfolio-identity-gesture portfolio-identity-gesture--support group"
            onClick={() => setSupportOpen(true)}
            aria-label={`Support ${label}`}
          >
            <span className="signal-group signal-group-reputation" aria-hidden>
              <ProtocolMotionArrow className="signal-metric-arrow" />
            </span>
            Support
          </button>

          {!isDao ? (
            <>
              <span className="portfolio-identity-gesture-sep" aria-hidden>
                ·
              </span>

              <button
                type="button"
                className="portfolio-identity-gesture portfolio-identity-gesture--message group"
                disabled={messagingBlocked}
                onClick={() => {
                  if (messagingBlocked) return;
                  setMessageOpen(true);
                }}
                aria-label={
                  viewerMuted
                    ? `Unmute to message ${label}`
                    : blockEitherWay
                      ? `Messaging unavailable for ${label}`
                      : `Message ${label}`
                }
              >
                Message
              </button>
            </>
          ) : null}
        </div>
      )}
      {!isDao ? (
        <DmComposeSheet
          open={messageOpen}
          peerAccountId={pageAccountId}
          peerName={profileName}
          mood={mood}
          onClose={() => setMessageOpen(false)}
        />
      ) : null}
      <ProfileSupportSheet
        open={supportOpen}
        pageAccountId={pageAccountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        mood={mood}
        onOpenChange={setSupportOpen}
      />
      {!isDao ? (
        <EndorseComposeSheet
          open={endorseOpen}
          pageAccountId={pageAccountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
          mood={mood}
          onOpenChange={setEndorseOpen}
        />
      ) : null}
    </div>
  );
}
