'use client';

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import Link from 'next/link';
import {
  EditIcon,
  OsGestureSheet,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  ShareIcon,
  osIconActionGlyphClassName,
  standingIdentityAccountCopy,
} from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { FeedPhotoEnlargeScreen } from '@/features/home/feed-photo-enlarge-screen';
import { PostMediaStrip } from '@/features/home/post-media';
import {
  EndorseComposeSheet,
  type EndorseComposeIntent,
} from '@/components/panels/endorse-compose-sheet';
import {
  EndorsementSupportSheet,
  type EndorsementSupportTarget,
} from '@/components/panels/endorsement-support-sheet';
import { EndorsementSupportersSheet } from '@/components/panels/endorsement-supporters-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { accountIdsEqual } from '@/lib/account-match';
import {
  endorsementVouchLine,
  formatEndorsementTime,
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';
import { endorsementFocusSharePath } from '@/lib/endorsement-focus';
import {
  endorsementStageMedia,
  parseEndorsementMediaRef,
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
 * Shareable vouch focus — full note, shared media tile, sheet action row.
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
  const [supportersOpen, setSupportersOpen] = useState(false);
  const [supportersRefreshKey, setSupportersRefreshKey] = useState(0);
  const [mediaOpen, setMediaOpen] = useState(false);

  const sheetOpen = open && !closing && Boolean(item);
  const issuerAccountId = item?.issuer ?? '';
  const targetAccountId = item?.target ?? pageAccountId;
  const issuerName = displayName(
    issuerAccountId,
    item?.issuerName ?? undefined
  );
  const targetName = displayName(
    targetAccountId,
    item?.targetName ?? undefined
  );
  const topic = humanizeEndorsementTopic(item?.topic);
  const time = item ? formatEndorsementTime(item) : '';
  const note = item?.note?.trim() || null;
  const stageMedia = item
    ? endorsementStageMedia({
        media: item.media,
        mediaUrl: item.mediaUrl,
      })
    : null;
  const stageIsVideo = Boolean(
    stageMedia?.mime.toLowerCase().startsWith('video/')
  );
  const vouchLine = endorsementVouchLine(issuerName, targetName, item?.topic);
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
    setSupportersOpen(false);
    setMediaOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  function handleShare() {
    if (!item) return;
    const href = endorsementFocusSharePath(item);
    const url = new URL(href, window.location.origin).toString();
    const headline = vouchLine;
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

  // Title stays "{verb} {person}"; the visible person row is the shared
  // avatar + name + @id identity (one profile link), topic underneath —
  // so a design vouch from Bob reads "Endorsed Bob", not "design Bob".
  return (
    <>
      <OsGestureSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        verb="Endorsed"
        personName={issuerName}
        subject={topic}
        handle={fallbackLabel(issuerAccountId)}
        signal="endorse"
        whisper={`Vouch for ${targetName}`}
        {...(issuerAccountId
          ? {
              personIdentity: (
                <Link
                  href={portfolioPath(issuerAccountId)}
                  className="gesture-sheet-identity-link"
                  scroll={false}
                  aria-label={`View ${issuerName}'s profile`}
                >
                  <StandingIdentity
                    accountId={issuerAccountId}
                    profileName={item?.issuerName ?? undefined}
                    avatarUrl={item?.issuerAvatarUrl ?? null}
                  />
                </Link>
              ),
            }
          : {})}
        closeAriaLabel="Close endorsement"
        backdropLabel="Close endorsement"
        moodId={effectiveMood?.id}
        panelStyle={panelStyle}
        bodyClassName="profile-support-sheet-body"
        titleId={titleId}
        zIndex={zIndex}
        footer={
          item ? (
            <div className="os-sheet-footer endorsement-focus-toolbar">
              <OsIconAction ariaLabel="Share endorsement" onClick={handleShare}>
                <ShareIcon
                  className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                  aria-hidden
                />
              </OsIconAction>
              {viewerOwns ? (
                <OsIconAction ariaLabel="Edit endorsement" onClick={handleEdit}>
                  <EditIcon
                    className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                    aria-hidden
                  />
                </OsIconAction>
              ) : null}
              {canSupport ? (
                <OsSheetActions
                  layout="row-compact"
                  size="sm"
                  tone="frosted-primary"
                  borderless
                  className="endorsements-endorse-action endorsement-focus-support"
                >
                  <OsSheetAction type="button" onClick={handleSupport}>
                    {!isConnected ? 'Connect' : 'Support'}
                  </OsSheetAction>
                </OsSheetActions>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {item ? (
          <div className="endorsement-focus-sheet">
            {note ? <p className="endorsement-focus-note">{note}</p> : null}

            {stageMedia ? (
              <div className="endorsement-focus-media">
                <PostMediaStrip
                  items={[stageMedia]}
                  size="page"
                  focused={stageIsVideo}
                  activateLabel={
                    stageIsVideo
                      ? 'Play endorsement video'
                      : 'View endorsement photo'
                  }
                  onActivate={() => setMediaOpen(true)}
                />
              </div>
            ) : null}

            <p className="endorsement-focus-meta">
              Endorsed
              {time ? ` · ${time}` : ''}
              {supporterCount > 0 && spendTargetId ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="endorsement-focus-supporters"
                    onClick={() => setSupportersOpen(true)}
                  >
                    {supporterCount} supporter
                    {supporterCount === 1 ? '' : 's'}
                  </button>
                </>
              ) : supporterCount > 0 ? (
                ` · ${supporterCount} supporter${supporterCount === 1 ? '' : 's'}`
              ) : null}
            </p>
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
        onSuccess={() => {
          setSupportersRefreshKey((key) => key + 1);
          onSuccess?.();
        }}
      />

      <EndorsementSupportersSheet
        open={supportersOpen}
        endorsementId={spendTargetId}
        copy={topic || null}
        zIndex={nestedZ}
        refreshKey={supportersRefreshKey}
        onOpenChange={setSupportersOpen}
      />

      <FeedPhotoEnlargeScreen
        open={mediaOpen && Boolean(stageMedia)}
        onOpenChange={setMediaOpen}
        title={vouchLine}
        caption={vouchLine}
        captionDate={time || null}
        captionExpandLabel="Show endorsement"
        captionCollapseLabel="Collapse endorsement"
        closeAriaLabel="Back to endorsement"
        photos={stageMedia ? [stageMedia] : []}
        peekIdentity={
          item ? (
            <Link
              href={portfolioPath(item.issuer)}
              className="os-media-face-identity"
              scroll={false}
              aria-label={`View ${issuerName}'s profile`}
              onClick={() => setMediaOpen(false)}
            >
              <AccountAvatar
                accountId={item.issuer}
                src={item.issuerAvatarUrl ?? null}
                fallbackInitial={issuerName}
                size="lg"
              />
              <span className="os-media-face-identity-copy">
                <span className="os-media-face-identity-name">
                  {issuerName}
                </span>
                <span className="os-media-face-identity-handle">
                  {standingIdentityAccountCopy(issuerAccountId)}
                </span>
              </span>
            </Link>
          ) : null
        }
      />
    </>
  );
}
