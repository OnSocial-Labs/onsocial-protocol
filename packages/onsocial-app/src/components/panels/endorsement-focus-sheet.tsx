'use client';

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import Link from 'next/link';
import { OsGestureSheet, ShareIcon, StandingIdentity } from '@onsocial/ui';
import {
  EndorseComposeSheet,
  type EndorseComposeIntent,
} from '@/components/panels/endorse-compose-sheet';
import {
  EndorsementSupportSheet,
  type EndorsementSupportTarget,
} from '@/components/panels/endorsement-support-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { accountIdsEqual } from '@/lib/account-match';
import {
  formatEndorsementTime,
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';
import { endorsementFocusSharePath } from '@/lib/endorsement-focus';
import {
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
} from '@/lib/endorsement-media';
import type {
  EndorseExistingDraft,
  EndorsementPanelItem,
} from '@/lib/endorsements-panel-data';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { shareUrl } from '@/lib/share-url';
import { SHEET_Z } from '@/lib/sheet-z';
import { resolveEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';

interface EndorsementFocusSheetProps {
  open: boolean;
  item: EndorsementPanelItem | null;
  pageAccountId: string;
  mood?: ResolvedMood | null;
  zIndex?: number;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Shareable vouch focus — full note, media with controls, Support / Edit / Share.
 * Hosts on the recipient face (`?endorsement=`) or over the overlay peek.
 */
export function EndorsementFocusSheet({
  open,
  item,
  pageAccountId,
  mood = null,
  zIndex = SHEET_Z.gesture,
  onOpenChange,
  onSuccess,
}: EndorsementFocusSheetProps) {
  const titleId = useId();
  const { accountId: viewerAccountId, isConnected, connect } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeIntent, setComposeIntent] =
    useState<EndorseComposeIntent>('edit');
  const [composeExisting, setComposeExisting] =
    useState<EndorseExistingDraft | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportTarget, setSupportTarget] =
    useState<EndorsementSupportTarget | null>(null);

  const sheetOpen = open && !closing && Boolean(item);
  const issuerAccountId = item?.issuer ?? '';
  const targetAccountId = item?.target ?? pageAccountId;
  const issuerName = displayName(issuerAccountId, item?.issuerName ?? undefined);
  const targetName = displayName(
    targetAccountId,
    item?.targetName ?? undefined
  );
  const topic = humanizeEndorsementTopic(item?.topic);
  const time = item ? formatEndorsementTime(item) : '';
  const note = item?.note?.trim() || null;
  const media = parseEndorsementMediaRef(item?.media);
  const mediaUrl = item
    ? resolveEndorsementDisplayMediaUrl({
        media,
        mediaUrl: item.mediaUrl,
      })
    : null;
  const mediaMime = media?.mime ?? null;
  const spendTargetId = item
    ? resolveEndorsementSpendTargetId({
        id: typeof item.id === 'string' ? item.id : null,
        issuer: item.issuer,
        target: item.target,
        topic: item.topic,
      })
    : null;
  const supporterCount = item?.supporterCount ?? 0;
  const viewerOwns =
    Boolean(viewerAccountId) &&
    Boolean(item) &&
    accountIdsEqual(viewerAccountId!, item!.issuer);
  const canSupport =
    Boolean(spendTargetId) &&
    (!viewerAccountId || !accountIdsEqual(viewerAccountId, targetAccountId));

  const fetchedMood = usePageOwnerMood(
    targetAccountId,
    Boolean(targetAccountId) && (open || closing)
  );
  const effectiveMood = mood ?? fetchedMood;
  const panelStyle = useMemo(
    () =>
      effectiveMood
        ? (supportSheetPanelStyle(effectiveMood.cssVars) as CSSProperties)
        : undefined,
    [effectiveMood]
  );
  const nestedZ = Math.max(zIndex + 2, SHEET_Z.nested);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    setComposeOpen(false);
    setComposeExisting(null);
    setSupportOpen(false);
    setSupportTarget(null);
    onOpenChange(false);
  }, [onOpenChange]);

  function handleShare() {
    if (!item) return;
    const href = endorsementFocusSharePath(item);
    const url = new URL(href, window.location.origin).toString();
    const headline = topic
      ? `${issuerName} endorsed ${targetName} for ${topic}`
      : `${issuerName} endorsed ${targetName}`;
    void (async () => {
      const result = await shareUrl({
        url,
        title: headline,
        text: headline,
      });
      if (result === 'copied') {
        setTxResult({
          type: 'success',
          msg: txToastSuccess.endorsementLinkCopied,
        });
        return;
      }
      if (result === 'failed') {
        setTxResult({
          type: 'error',
          msg: txToastError.endorsementShareFailed,
        });
      }
    })();
  }

  function handleSupport() {
    if (!item || !spendTargetId) return;
    if (!isConnected) {
      void connect();
      return;
    }
    setSupportTarget({
      endorsementId: spendTargetId,
      recipientAccountId: item.target,
      recipientName: item.targetName,
      issuer: item.issuer,
      topic: item.topic ?? null,
    });
    setSupportOpen(true);
  }

  function handleEdit() {
    if (!item) return;
    if (!isConnected) {
      void connect();
      return;
    }
    setComposeIntent('edit');
    setComposeExisting({
      id: typeof item.id === 'string' ? item.id : null,
      topic: item.topic ?? null,
      note: item.note ?? null,
      media: parseEndorsementMediaRef(item.media),
      mediaUrl: item.mediaUrl ?? null,
    });
    setComposeOpen(true);
  }

  return (
    <>
      <OsGestureSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        verb={topic || 'Endorsement'}
        personName={issuerName}
        handle={fallbackLabel(issuerAccountId)}
        signal="endorse"
        whisper={`Vouch for ${targetName}`}
        closeAriaLabel="Close endorsement"
        backdropLabel="Close endorsement"
        moodId={effectiveMood?.id}
        panelStyle={panelStyle}
        bodyClassName="profile-support-sheet-body"
        titleId={titleId}
        zIndex={zIndex}
      >
        {item ? (
          <div className="endorsement-focus-sheet">
            <Link
              href={portfolioPath(item.issuer)}
              className="endorsement-focus-identity"
              scroll={false}
              aria-label={`View ${issuerName}'s profile`}
            >
              <StandingIdentity
                accountId={item.issuer}
                profileName={item.issuerName}
                avatarUrl={item.issuerAvatarUrl}
              />
            </Link>

            {note ? <p className="endorsement-focus-note">{note}</p> : null}

            {mediaUrl ? (
              <div className="endorsement-focus-media">
                {mediaMime?.toLowerCase().startsWith('video/') ? (
                  <video
                    src={mediaUrl}
                    className="endorsement-focus-media-el"
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={
                      topic
                        ? `Endorsement video for ${topic}`
                        : 'Endorsement video'
                    }
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt={media?.alt?.trim() || ''}
                    className="endorsement-focus-media-el"
                  />
                )}
              </div>
            ) : null}

            <p className="endorsement-focus-meta">
              Endorsed
              {time ? ` · ${time}` : ''}
              {supporterCount > 0
                ? ` · ${supporterCount} supporter${supporterCount === 1 ? '' : 's'}`
                : ''}
            </p>

            <div className="endorsement-focus-actions">
              <button
                type="button"
                className="endorsement-row-action endorsement-focus-share"
                onClick={handleShare}
              >
                <ShareIcon aria-hidden />
                Share
              </button>
              {canSupport ? (
                <button
                  type="button"
                  className="endorsement-row-action"
                  onClick={handleSupport}
                >
                  {!isConnected ? 'Connect' : 'Support'}
                </button>
              ) : null}
              {viewerOwns ? (
                <button
                  type="button"
                  className="endorsement-row-action"
                  onClick={handleEdit}
                >
                  Edit
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </OsGestureSheet>

      <EndorseComposeSheet
        open={composeOpen}
        pageAccountId={item?.target ?? pageAccountId}
        profileName={item?.targetName ?? null}
        avatarUrl={item?.targetAvatarUrl ?? null}
        mood={
          item && !accountIdsEqual(item.target, pageAccountId) ? null : mood
        }
        intent={composeIntent}
        existing={composeExisting}
        zIndex={nestedZ}
        onOpenChange={(next) => {
          setComposeOpen(next);
          if (!next) setComposeExisting(null);
        }}
        onSuccess={onSuccess}
      />

      <EndorsementSupportSheet
        open={supportOpen}
        target={supportTarget}
        mood={
          item && !accountIdsEqual(item.target, pageAccountId) ? null : mood
        }
        zIndex={nestedZ}
        onOpenChange={(next) => {
          setSupportOpen(next);
          if (!next) setSupportTarget(null);
        }}
        onSuccess={onSuccess}
      />
    </>
  );
}
