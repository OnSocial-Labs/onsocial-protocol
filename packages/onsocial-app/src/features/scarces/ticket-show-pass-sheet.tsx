'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ProfileAvatar,
  resolveOsGlassPanelFilter,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import {
  signTicketPassLive,
  TICKET_PASS_LIVE_REFRESH_MS,
} from '@/features/scarces/ticket-pass-live';
import {
  ticketPassSeatLabel,
  ticketPassStatusLabel,
} from '@/features/scarces/ticket-pass-payload';
import { TicketPassQr } from '@/features/scarces/ticket-pass-qr';
import { TicketClaimRefundAction } from '@/features/scarces/ticket-claim-refund-action';
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
import { fallbackLabel } from '@/lib/profile-display';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

/**
 * Show pass — same OsSlideOverScreen chrome as Listen / Read.
 * Back lives in the OS nav row, clipped to the phone card.
 */
export function TicketShowPassSheet({
  open,
  onClose,
  title,
  cover = null,
  collectionId,
  tokenId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cover?: string | null;
  collectionId: string;
  tokenId: string;
}) {
  const [wasOpen, setWasOpen] = useState(open);
  const [status, setStatus] = useState<TicketTokenStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [livePayload, setLivePayload] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveReady, setLiveReady] = useState(false);
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
      setCodeCopied(false);
      setLivePayload(null);
      setLiveError(null);
      setLiveReady(false);
      setHolderFace(null);
      setHolderFetchOwnerId(null);
      setHolderFetchDone(false);
    }
  }

  const statusLoading = open && !statusReady;

  const cardStyle = useMemo(() => {
    const frost = resolveOsGlassPanelFilter();
    return {
      backdropFilter: frost,
      WebkitBackdropFilter: frost,
    };
  }, []);

  const passCode = livePayload?.trim() || '';
  const copyPassCode = useCallback(async () => {
    if (!passCode) return;
    try {
      await navigator.clipboard.writeText(passCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      /* leave code visible for manual read */
    }
  }, [passCode]);

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
    if (!statusReady || !status) return;

    let cancelled = false;
    let timer: number | null = null;

    const refresh = async () => {
      const viewer = accountId?.trim() || '';
      if (!viewer) {
        if (!cancelled) {
          setLivePayload(null);
          setLiveError('Connect your wallet to show a live pass.');
          setLiveReady(true);
        }
        return;
      }
      const owner = status.ownerId.trim();
      if (!owner || !accountIdsEqual(viewer, owner)) {
        if (!cancelled) {
          setLivePayload(null);
          setLiveError('Only the pass owner can show a live door code.');
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
          setLiveError('Enable your App session to show a live pass.');
          setLiveReady(true);
        }
        return;
      }

      const next = await signTicketPassLive({
        session,
        collectionId,
        tokenId,
      });
      if (cancelled) return;
      if (!next) {
        setLivePayload(null);
        setLiveError('Could not refresh pass code.');
        setLiveReady(true);
        return;
      }
      setLivePayload(next);
      setLiveError(null);
      setLiveReady(true);
    };

    void refresh();
    timer = window.setInterval(() => {
      void refresh();
    }, TICKET_PASS_LIVE_REFRESH_MS);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [accountId, collectionId, open, status, statusReady, tokenId]);

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
      })
    : statusLoading
      ? 'Checking pass…'
      : (statusError ?? 'Pass');

  const toneClass = status
    ? status.isValid
      ? ' is-valid'
      : status.isFullyRedeemed
        ? ' is-used'
        : ' is-invalid'
    : '';

  const holderHandle = ownerId ? fallbackLabel(ownerId) : '';
  const holderDisplay = holderFaceForOwner?.displayName?.trim() || null;
  const holderPrimary = holderDisplay || null;
  const holderAccount = holderHandle ? `@${holderHandle}` : '';
  const qrHint = !liveReady
    ? 'Preparing live pass…'
    : liveError
      ? liveError
      : null;

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title={name}
      subtitle={statusLine}
      closeAriaLabel="Back from pass"
      zIndex={SCARCE_Z.nestedOverCommerce}
      className="ticket-pass-slide"
      contentClassName="ticket-pass-slide-body"
    >
      <div className="ticket-show-pass">
        <div className="ticket-show-pass-card">
          <div
            className="ticket-show-pass-card-frost"
            style={cardStyle}
            aria-hidden
          />
          <div className="ticket-show-pass-card-body">
            <div className="ticket-show-pass-header">
              {media ? (
                <img
                  src={media}
                  alt=""
                  className="ticket-show-pass-mark"
                  onError={() => setThumbFailed(true)}
                />
              ) : null}

              <h2 className="ticket-show-pass-title">{name}</h2>
              <p className={`ticket-show-pass-status${toneClass}`}>
                {statusLine}
              </p>
            </div>

            {livePayload ? (
              <TicketPassQr
                value={livePayload}
                title={`QR for ${name}`}
                className="ticket-show-pass-qr"
              />
            ) : (
              <p className="ticket-show-pass-hint">
                {qrHint ?? 'Pass code unavailable.'}
              </p>
            )}

            <div className="ticket-show-pass-footer">
              <div
                className={`ticket-show-pass-identity${
                  ownerId ? '' : ' is-solo'
                }`}
              >
                {ownerId ? (
                  <ProfileAvatar
                    src={holderFaceForOwner?.avatarUrl ?? null}
                    fallbackInitial={holderDisplay || ownerId}
                    size="sm"
                    shellLoading={!holderReady}
                    className="ticket-show-pass-holder-avatar"
                  />
                ) : null}
                <div className="ticket-show-pass-identity-copy">
                  {ownerId && holderPrimary ? (
                    <p className="ticket-show-pass-holder-name">
                      {holderPrimary}
                    </p>
                  ) : null}
                  {ownerId && holderAccount ? (
                    <p className="ticket-show-pass-holder-account">
                      {holderAccount}
                    </p>
                  ) : null}
                  <p className="ticket-show-pass-seat">
                    {ticketPassSeatLabel(tokenId)}
                  </p>
                  {passCode ? (
                    <button
                      type="button"
                      className="ticket-show-pass-code"
                      onClick={() => void copyPassCode()}
                      aria-label="Copy live pass code for door entry"
                    >
                      {codeCopied ? 'Copied' : 'Copy live code'}
                    </button>
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
          </div>
        </div>
      </div>
    </OsSlideOverScreen>
  );
}
