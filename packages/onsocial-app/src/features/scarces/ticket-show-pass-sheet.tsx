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
import { SheetCloseButton, useScrollLock } from '@onsocial/ui';
import {
  encodeTicketPassPayload,
  ticketPassStatusLabel,
} from '@/features/scarces/ticket-pass-payload';
import { TicketPassQr } from '@/features/scarces/ticket-pass-qr';
import {
  fetchTicketTokenStatus,
  type TicketTokenStatus,
} from '@/features/scarces/ticket-token-status';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const LIGHTBOX_EXIT_MS = 180;

/**
 * Full-screen Show pass — QR + check-in remaining.
 * Same lightbox chrome family as Read / Listen.
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
    }
  }

  const lightboxOpen = open && !closing;
  const statusLoading = lightboxOpen && !statusReady;
  const viewport = useVisualViewportSheetMetrics(open || closing);
  useScrollLock(lightboxOpen);

  const lightboxStyle = useMemo((): CSSProperties | undefined => {
    if (typeof window === 'undefined') return undefined;
    const vv = window.visualViewport;
    if (!viewport.isMobile || !vv || viewport.height <= 0) return undefined;
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: viewport.height,
      ['--scarce-lightbox-vh' as string]: `${viewport.height}px`,
    };
  }, [viewport.height, viewport.isMobile]);

  const requestClose = useCallback(() => {
    setClosing(true);
    setEntered(false);
  }, []);

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

  const name = (status?.title ?? title).trim() || 'Pass';
  const media = status?.mediaUrl?.trim() || cover?.trim() || null;
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

  if (!mounted || (!open && !closing)) return null;

  return createPortal(
    <div
      className={`scarce-card-lightbox scarce-clip-listen-lightbox ticket-show-pass-lightbox${
        entered && !closing ? ' is-open' : ''
      }${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
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
          <p className="ticket-show-pass-eyebrow">Show pass</p>
          <h2 id={titleId} className="ticket-show-pass-title">
            {name}
          </h2>
          <p className={`ticket-show-pass-status${toneClass}`}>{statusLine}</p>

          {payload ? (
            <TicketPassQr
              value={payload}
              title={`QR for ${name}`}
              className="ticket-show-pass-qr"
            />
          ) : (
            <p className="ticket-show-pass-hint">Pass code unavailable.</p>
          )}

          <div className="ticket-show-pass-meta">
            {media ? (
              <img src={media} alt="" className="ticket-show-pass-thumb" />
            ) : (
              <span className="ticket-show-pass-thumb is-empty" aria-hidden />
            )}
            <div className="ticket-show-pass-meta-copy">
              <p className="ticket-show-pass-token">{tokenId}</p>
              <p className="ticket-show-pass-hint">
                Hold this screen at the door.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
