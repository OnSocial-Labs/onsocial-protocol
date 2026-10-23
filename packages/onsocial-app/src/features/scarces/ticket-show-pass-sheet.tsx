'use client';

import { useCallback, useEffect, useState } from 'react';
import { CopyIcon, Divider } from '@onsocial/ui';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  commercePartyLines,
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import {
  parseTicketPassLivePayload,
  signTicketPassLive,
  isTicketPassLiveFresh,
  ticketPassLiveMatchesSessionKey,
} from '@/features/scarces/ticket-pass-live';
import {
  downloadTicketPassPicture,
  renderTicketPassPicture,
  shareTicketPassPicture,
  ticketPassOffersSavePicture,
  ticketPassPictureFilename,
} from '@/features/scarces/ticket-pass-picture';
import {
  clearSavedTicketPass,
  readSavedTicketPass,
  ticketPassSavedTtlMs,
  writeSavedTicketPass,
} from '@/features/scarces/ticket-pass-saved';
import {
  ticketPassLiveCodePreview,
  ticketPassSeatLabel,
  ticketPassStatusLabel,
  type PassStaffVoice,
} from '@/features/scarces/ticket-pass-payload';
import { TicketPassQr } from '@/features/scarces/ticket-pass-qr';
import { TicketClaimRefundAction } from '@/features/scarces/ticket-claim-refund-action';
import { TICKET_PASS_CONNECT_LIVE } from '@/features/scarces/ticket-door-voice';
import {
  fetchTicketTokenStatus,
  type TicketTokenStatus,
} from '@/features/scarces/ticket-token-status';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { accountIdsEqual } from '@/lib/account-match';
import { restoreAppSocialSession } from '@/lib/app-social-session';
import {
  getCachedAppSocialSession,
  setCachedAppSocialSession,
} from '@/lib/app-social-session-cache';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

/**
 * Show pass — small cover, event name, then a saved QR.
 * The code is signed once and kept on this device. Download writes the PNG.
 * On a phone, Save shares that picture so the guest can keep it in Photos.
 * Copy puts the signed code on the clipboard for the door paste field.
 * The seat row shows a short preview, never the full string.
 */
export function TicketShowPassSheet({
  open,
  onClose,
  title,
  cover = null,
  collectionId,
  tokenId,
  eventEndsAtMs = null,
  whenLabel = null,
  placeLabel = null,
  voice,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cover?: string | null;
  collectionId: string;
  tokenId: string;
  eventEndsAtMs?: number | null;
  whenLabel?: string | null;
  placeLabel?: string | null;
  /** Coupon drops use redeem wording. Tickets and memberships stay on check-in. */
  voice?: PassStaffVoice;
}) {
  const [wasOpen, setWasOpen] = useState(open);
  const [status, setStatus] = useState<TicketTokenStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [artEnlargeOpen, setArtEnlargeOpen] = useState(false);
  const [livePayload, setLivePayload] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [exporting, setExporting] = useState<'download' | 'save' | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [canSave, setCanSave] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [holderFace, setHolderFace] = useState<CollectionCreatorFace | null>(
    null
  );
  const [holderFetchOwnerId, setHolderFetchOwnerId] = useState<string | null>(
    null
  );
  const [holderFetchDone, setHolderFetchDone] = useState(false);
  const { accountId } = useAppWallet();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStatus(null);
      setStatusError(null);
      setStatusReady(false);
      setThumbFailed(false);
      setArtEnlargeOpen(false);
      setExporting(null);
      setExportNote(null);
      setCodeCopied(false);
      const saved = readSavedTicketPass(tokenId);
      const cached =
        saved && isTicketPassLiveFresh(saved.expMs) ? saved.payload : null;
      setLivePayload(cached);
      setLiveError(null);
      setLiveReady(Boolean(cached));
      setHolderFace(null);
      setHolderFetchOwnerId(null);
      setHolderFetchDone(false);
    }
  }

  const statusLoading = open && !statusReady;

  const passCode = livePayload?.trim() || '';
  const passCodePreview = passCode ? ticketPassLiveCodePreview(passCode) : '';
  const copyPassCode = useCallback(async () => {
    if (!passCode) return;
    try {
      await navigator.clipboard.writeText(passCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      /* clipboard refused — the preview stays so the guest can retry */
    }
  }, [passCode]);

  useEffect(() => {
    if (!open) return;
    const saved = readSavedTicketPass(tokenId);
    if (!saved || !isTicketPassLiveFresh(saved.expMs)) return;
    setLivePayload(saved.payload);
    setLiveError(null);
    setLiveReady(true);
  }, [open, tokenId]);

  useEffect(() => {
    if (!open) return;
    const id = tokenId.trim();
    if (!id) return;
    let cancelled = false;
    void fetchTicketTokenStatus(id)
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setStatusError(next ? null : 'Could not load this pass.');
        setStatusReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(null);
        setStatusError('Could not load this pass.');
        setStatusReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tokenId]);

  const ownerId = status?.ownerId?.trim() || '';
  const shouldFetchHolder = open && Boolean(ownerId);
  const holderFaceForOwner =
    shouldFetchHolder && holderFetchOwnerId === ownerId ? holderFace : null;
  const holderReady = shouldFetchHolder
    ? holderFetchOwnerId === ownerId && holderFetchDone
    : !open || statusReady;

  useEffect(() => {
    if (!shouldFetchHolder) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void fetchCollectionCreatorFace(client, ownerId)
      .then((face) => {
        if (cancelled) return;
        setHolderFetchOwnerId(ownerId);
        setHolderFace(face);
        setHolderFetchDone(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHolderFetchOwnerId(ownerId);
        setHolderFace({ avatarUrl: null, displayName: null });
        setHolderFetchDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetchHolder, ownerId]);

  useEffect(() => {
    if (!open) return;
    setCanSave(ticketPassOffersSavePicture());
  }, [open]);

  useEffect(() => {
    if (!open || !statusReady) return;

    let cancelled = false;

    const ensureSavedPass = async () => {
      const owner = status?.ownerId?.trim() || '';
      const saved = readSavedTicketPass(tokenId);
      const savedFresh = Boolean(
        saved &&
          isTicketPassLiveFresh(saved.expMs) &&
          parseTicketPassLivePayload(saved.payload, collectionId)
      );
      const savedForOwner =
        savedFresh &&
        Boolean(saved && (!owner || accountIdsEqual(saved.ownerId, owner)));

      if (saved && owner && !accountIdsEqual(saved.ownerId, owner)) {
        clearSavedTicketPass(tokenId);
      }

      if (savedForOwner && saved) {
        const viewer = accountId?.trim() || '';
        const canResign =
          Boolean(viewer) && Boolean(owner) && accountIdsEqual(viewer, owner);
        let sessionKey = '';
        if (canResign) {
          let session = getCachedAppSocialSession(viewer);
          if (!session) {
            session = await restoreAppSocialSession(viewer);
            if (session) setCachedAppSocialSession(viewer, session);
          }
          sessionKey = session?.key?.publicKey ?? '';
        }
        const sameKey =
          !sessionKey ||
          ticketPassLiveMatchesSessionKey(saved.payload, sessionKey);
        if (sameKey) {
          if (!cancelled) {
            setLivePayload(saved.payload);
            setLiveError(null);
            setLiveReady(true);
          }
          return;
        }
      }

      if (!status) {
        if (!cancelled) {
          setLiveReady(true);
          if (!savedFresh) {
            setLivePayload(null);
            setLiveError(statusError ?? 'Pass code unavailable.');
          }
        }
        return;
      }

      const viewer = accountId?.trim() || '';
      if (!viewer) {
        if (!cancelled) {
          setLivePayload(null);
          setLiveError(TICKET_PASS_CONNECT_LIVE);
          setLiveReady(true);
        }
        return;
      }
      if (!owner || !accountIdsEqual(viewer, owner)) {
        if (!cancelled) {
          setLivePayload(null);
          setLiveError('Only the pass owner can save this pass.');
          setLiveReady(true);
        }
        return;
      }

      let session = getCachedAppSocialSession(viewer);
      if (!session) {
        session = await restoreAppSocialSession(viewer);
        if (session) setCachedAppSocialSession(viewer, session);
      }
      if (!session?.key?.sign) {
        if (!cancelled) {
          setLivePayload(null);
          setLiveError('Enable your App session to save this pass.');
          setLiveReady(true);
        }
        return;
      }

      const next = await signTicketPassLive({
        session,
        collectionId,
        tokenId,
        ttlMs: ticketPassSavedTtlMs({
          nowMs: Date.now(),
          eventEndsAtMs,
        }),
      });
      if (cancelled) return;
      const parsed = next
        ? parseTicketPassLivePayload(next, collectionId)
        : null;
      if (!next || !parsed) {
        setLivePayload(null);
        setLiveError('Could not save pass code.');
        setLiveReady(true);
        return;
      }
      writeSavedTicketPass({
        tokenId: parsed.tokenId,
        ownerId: owner,
        payload: next,
        expMs: parsed.expMs,
      });
      setLivePayload(next);
      setLiveError(null);
      setLiveReady(true);
    };

    void ensureSavedPass();
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    collectionId,
    eventEndsAtMs,
    open,
    status,
    statusError,
    statusReady,
    tokenId,
  ]);

  const name = (status?.title ?? title).trim() || 'Pass';
  const coverUrl = resolveScarceMediaUrl(cover?.trim() || null);
  const statusUrl = resolveScarceMediaUrl(status?.mediaUrl?.trim() || null);
  const media = thumbFailed ? null : coverUrl || statusUrl;
  const statusLine = status
    ? ticketPassStatusLabel({
        isValid: status.isValid,
        isFullyRedeemed: status.isFullyRedeemed,
        isRevoked: status.isRevoked,
        isExpired: status.isExpired,
        isRefunded: status.isRefunded,
        redeemCount: status.redeemCount,
        maxRedeems: status.maxRedeems,
        voice,
      })
    : !passCode && statusLoading
      ? 'Checking…'
      : !passCode
        ? (statusError ?? '')
        : '';

  const toneClass = status
    ? status.isValid
      ? ' is-valid'
      : status.isFullyRedeemed
        ? ' is-used'
        : ' is-invalid'
    : '';

  const { name: holderName, handle: holderHandle } = ownerId
    ? commercePartyLines(ownerId, holderFaceForOwner?.displayName)
    : { name: '', handle: '' };
  const holderAccount = holderHandle ? `@${holderHandle}` : '';
  const qrHint = !liveReady ? 'Preparing…' : liveError ? liveError : null;

  const noteExport = useCallback((note: string) => {
    setExportNote(note);
    window.setTimeout(() => setExportNote(null), 1600);
  }, []);

  const buildPassPicture = useCallback(async () => {
    if (!passCode) return null;
    return renderTicketPassPicture({
      title: name,
      whenLabel,
      placeLabel,
      statusLabel: statusLine,
      seatLabel: ticketPassSeatLabel(tokenId, voice),
      holderName: holderName || null,
      holderAccount: holderAccount || null,
      qrValue: passCode,
      coverUrl: media,
      valid: Boolean(status?.isValid),
    });
  }, [
    holderAccount,
    holderName,
    media,
    name,
    passCode,
    placeLabel,
    status?.isValid,
    statusLine,
    tokenId,
    voice,
    whenLabel,
  ]);

  const downloadPicture = useCallback(async () => {
    if (!passCode || exporting) return;
    setExporting('download');
    setExportNote(null);
    try {
      const blob = await buildPassPicture();
      if (!blob) {
        noteExport('Could not download');
        return;
      }
      downloadTicketPassPicture(blob, ticketPassPictureFilename(name));
      // The browser Save dialog or download tray is the confirmation.
      // "Downloaded" was landing before that dialog was confirmed.
    } catch {
      noteExport('Could not download');
    } finally {
      setExporting(null);
    }
  }, [buildPassPicture, exporting, name, noteExport, passCode]);

  const savePicture = useCallback(async () => {
    if (!passCode || exporting) return;
    setExporting('save');
    setExportNote(null);
    try {
      const blob = await buildPassPicture();
      if (!blob) {
        noteExport('Could not save');
        return;
      }
      const shared = await shareTicketPassPicture(
        blob,
        ticketPassPictureFilename(name),
        name
      );
      if (shared === 'shared') noteExport('Saved');
      else if (shared === 'unavailable') noteExport('Could not save');
    } catch {
      noteExport('Could not save');
    } finally {
      setExporting(null);
    }
  }, [buildPassPicture, exporting, name, noteExport, passCode]);

  return (
    <OsMediaFaceShell
      open={open}
      onClose={onClose}
      title={name}
      closeAriaLabel="Back from pass"
      zIndex={SCARCE_Z.nestedOverCommerce}
      keepDock
      screenHeader
      className="ticket-pass-slide"
      contentClassName="ticket-pass-slide-body"
    >
      <div className="ticket-show-pass">
        <div className="ticket-show-pass-body">
          {media ? (
            <button
              type="button"
              className="ticket-show-pass-mark-btn"
              onClick={() => setArtEnlargeOpen(true)}
              aria-label={`View artwork for ${name}`}
            >
              <img
                src={media}
                alt=""
                className="ticket-show-pass-mark"
                onError={() => setThumbFailed(true)}
              />
            </button>
          ) : null}
          <p className="ticket-show-pass-name">{name}</p>
          {/* One line from the first paint, so a late status cannot drop the QR. */}
          <div className="ticket-show-pass-status-slot">
            {statusLine ? (
              <p className={`ticket-show-pass-status${toneClass}`}>
                {statusLine}
              </p>
            ) : null}
          </div>

          <div
            className="ticket-show-pass-qr"
            aria-busy={livePayload ? undefined : true}
          >
            {livePayload ? (
              <TicketPassQr
                value={livePayload}
                title={`QR for ${name}`}
                className="ticket-show-pass-qr-code"
              />
            ) : (
              <p className="ticket-show-pass-hint">
                {qrHint ?? 'Pass code unavailable.'}
              </p>
            )}
          </div>

          <div className="ticket-show-pass-footer">
            <div
              className={`ticket-show-pass-identity${
                ownerId ? '' : ' is-solo'
              }`}
            >
              {ownerId ? (
                <AccountAvatar
                  accountId={ownerId}
                  src={holderFaceForOwner?.avatarUrl ?? null}
                  fallbackInitial={holderName || ownerId}
                  size="sm"
                  shellLoading={!holderReady}
                  className="ticket-show-pass-holder-avatar"
                />
              ) : null}
              <div className="ticket-show-pass-identity-copy">
                {ownerId && holderName ? (
                  <p className="ticket-show-pass-holder-name">{holderName}</p>
                ) : null}
                {ownerId && holderAccount ? (
                  <p className="ticket-show-pass-holder-account">
                    {holderAccount}
                  </p>
                ) : null}
              </div>
            </div>

            <Divider variant="detail" className="ticket-show-pass-divider" />

            <div className="ticket-show-pass-meta">
              <span className="ticket-show-pass-seat">
                {ticketPassSeatLabel(tokenId, voice)}
              </span>
              {passCode ? (
                <button
                  type="button"
                  className={`ticket-show-pass-code${
                    codeCopied ? ' is-copied' : ''
                  }`}
                  onClick={() => void copyPassCode()}
                  aria-label={
                    codeCopied
                      ? 'Live pass code copied'
                      : 'Copy live pass code for door entry'
                  }
                >
                  <span className="ticket-show-pass-code-preview">
                    {codeCopied ? 'Copied' : passCodePreview}
                  </span>
                  {codeCopied ? null : (
                    <CopyIcon
                      className="ticket-show-pass-code-icon"
                      aria-hidden
                    />
                  )}
                </button>
              ) : null}
            </div>

            <div className="ticket-show-pass-actions">
              {passCode ? (
                <button
                  type="button"
                  className="ticket-show-pass-action"
                  onClick={() => void downloadPicture()}
                  disabled={exporting != null}
                >
                  {exporting === 'download' ? 'Downloading…' : 'Download'}
                </button>
              ) : (
                <span className="ticket-show-pass-action is-reserved" aria-hidden>
                  Download
                </span>
              )}
              {canSave && passCode ? (
                <button
                  type="button"
                  className="ticket-show-pass-action"
                  onClick={() => void savePicture()}
                  disabled={exporting != null}
                >
                  {exporting === 'save' ? 'Saving…' : 'Save'}
                </button>
              ) : null}
            </div>
            {exportNote ? (
              <p
                className={`ticket-show-pass-export-note${
                  exportNote === 'Saved' ? ' is-saved' : ''
                }`}
                role="status"
              >
                {exportNote}
              </p>
            ) : null}

            <TicketClaimRefundAction
              collectionId={collectionId}
              tokenId={tokenId}
              status={status}
              onClaimed={() => {
                setStatusReady(false);
                void fetchTicketTokenStatus(tokenId)
                  .then((next) => {
                    setStatus(next);
                    setStatusReady(true);
                  })
                  .catch(() => {
                    setStatusReady(true);
                  });
              }}
            />
          </div>
        </div>
      </div>
      {media && artEnlargeOpen ? (
        <DropArtOverlay
          open={artEnlargeOpen}
          src={media}
          label={name}
          onClose={() => setArtEnlargeOpen(false)}
        />
      ) : null}
    </OsMediaFaceShell>
  );
}
