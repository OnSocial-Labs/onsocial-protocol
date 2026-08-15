'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ProfileAvatar,
  resolveGlassScrimBackdropFilter,
  resolveOsGlassPanelFilter,
  SheetCloseButton,
  useScrollLock,
} from '@onsocial/ui';
import {
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import {
  encodeTicketPassPayload,
  ticketPassSeatLabel,
  ticketPassStatusLabel,
} from '@/features/scarces/ticket-pass-payload';
import { TicketPassQr } from '@/features/scarces/ticket-pass-qr';
import {
  fetchTicketTokenStatus,
  type TicketTokenStatus,
} from '@/features/scarces/ticket-token-status';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fallbackLabel } from '@/lib/profile-display';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const LIGHTBOX_EXIT_MS = 180;

/**
 * Full-screen Show pass — QR-first for the door.
 * Frost scrim like drawers; glass card; quiet copyable backup code.
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
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [status, setStatus] = useState<TicketTokenStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [holderFace, setHolderFace] = useState<CollectionCreatorFace | null>(
    null
  );
  const [holderFetchOwnerId, setHolderFetchOwnerId] = useState<string | null>(
    null
  );
  const [holderFetchDone, setHolderFetchDone] = useState(false);
  const mounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setEntered(false);
      setStatus(null);
      setStatusError(null);
      setStatusReady(false);
      setThumbFailed(false);
      setCodeCopied(false);
      setHolderFace(null);
      setHolderFetchOwnerId(null);
      setHolderFetchDone(false);
    }
  }

  const lightboxOpen = open && !closing;
  const statusLoading = lightboxOpen && !statusReady;
  const viewport = useVisualViewportSheetMetrics(open || closing);
  useScrollLock(lightboxOpen);

  const lightboxStyle = useMemo((): CSSProperties => {
    const frost = closing
      ? 'blur(0px)'
      : resolveGlassScrimBackdropFilter();
    const style: CSSProperties = {
      backdropFilter: frost,
      WebkitBackdropFilter: frost,
    };
    if (typeof window === 'undefined') return style;
    const vv = window.visualViewport;
    if (!viewport.isMobile || !vv || viewport.height <= 0) return style;
    return {
      ...style,
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: viewport.height,
      ['--scarce-lightbox-vh' as string]: `${viewport.height}px`,
    };
  }, [closing, viewport.height, viewport.isMobile]);

  const cardStyle = useMemo((): CSSProperties => {
    const frost = resolveOsGlassPanelFilter();
    return {
      backdropFilter: frost,
      WebkitBackdropFilter: frost,
    };
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    setEntered(false);
  }, []);

  const passCode = tokenId.trim();
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
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, LIGHTBOX_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const id = window.requestAnimationFrame(() => {
      setEntered(true);
      closeRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, requestClose]);

  useEffect(() => {
    if (!lightboxOpen) return;
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
  }, [lightboxOpen, tokenId]);

  const ownerId = status?.ownerId?.trim() || '';
  const shouldFetchHolder = lightboxOpen && Boolean(ownerId);
  const holderFaceForOwner =
    shouldFetchHolder && holderFetchOwnerId === ownerId ? holderFace : null;
  const holderReady = shouldFetchHolder
    ? holderFetchOwnerId === ownerId && holderFetchDone
    : !lightboxOpen || statusReady;

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

  const name = (status?.title ?? title).trim() || 'Pass';
  const coverUrl = resolveScarceMediaUrl(cover?.trim() || null);
  const statusUrl = resolveScarceMediaUrl(status?.mediaUrl?.trim() || null);
  const media = thumbFailed ? null : coverUrl || statusUrl;
  const payload = useMemo(
    () => encodeTicketPassPayload(collectionId, tokenId),
    [collectionId, tokenId]
  );
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

  if (!mounted || (!open && !closing)) return null;

  return createPortal(
    <div
      className={`scarce-card-lightbox ticket-show-pass-lightbox${
        entered && !closing ? ' is-open' : ''
      }${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Show pass"
      aria-labelledby={titleId}
      style={lightboxStyle}
    >
      <div className="ticket-show-pass">
        <div className="ticket-show-pass-top">
          <SheetCloseButton
            ref={closeRef}
            onClick={requestClose}
            ariaLabel="Close pass"
            className="ticket-show-pass-close"
          />
        </div>

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

              <h2 id={titleId} className="ticket-show-pass-title">
                {name}
              </h2>
              <p className={`ticket-show-pass-status${toneClass}`}>
                {statusLine}
              </p>
            </div>

            {payload ? (
              <TicketPassQr
                value={payload}
                title={`QR for ${name}`}
                className="ticket-show-pass-qr"
              />
            ) : (
              <p className="ticket-show-pass-hint">Pass code unavailable.</p>
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
                      aria-label="Copy pass code for door entry"
                    >
                      {codeCopied ? 'Copied' : passCode}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
