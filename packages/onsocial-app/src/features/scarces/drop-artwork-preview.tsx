'use client';

/**
 * Seat-tile artwork thumbs for create-drop — same size as variation sets,
 * Mage remove control, tap-to-zoom with the shared scarce card lightbox.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MultiplyIcon, SheetCloseButton } from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const LIGHTBOX_EXIT_MS = 180;

interface DropImageLightboxProps {
  open: boolean;
  src: string;
  label: string;
  onClose: () => void;
  /** Optional action under the zoomed art (e.g. Set as cover). */
  footer?: ReactNode;
}

/** Shared zoom dialog — same chrome as feed / list scarce previews. */
export function DropImageLightbox({
  open,
  src,
  label,
  onClose,
  footer,
}: DropImageLightboxProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
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
    }
  }

  const lightboxOpen = open && !closing;
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
      height: vv.height,
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
    const frame = window.requestAnimationFrame(() => setEntered(true));
    closeRef.current?.focus();
    return () => window.cancelAnimationFrame(frame);
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

  if (!mounted || (!open && !closing)) return null;

  return createPortal(
    <div
      className={`scarce-card-lightbox${entered && !closing ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={lightboxStyle}
      onClick={requestClose}
    >
      <p id={titleId} className="sr-only">
        {label}
      </p>
      <div className="scarce-card-lightbox-chrome">
        <SheetCloseButton
          ref={closeRef}
          onClick={requestClose}
          ariaLabel="Close preview"
          className="scarce-card-lightbox-close"
        />
      </div>
      <img
        key={src}
        className="scarce-card-lightbox-asset"
        src={src}
        alt=""
        onClick={(event) => event.stopPropagation()}
      />
      {footer ? (
        <div
          className="scarce-card-lightbox-footer"
          onClick={(event) => event.stopPropagation()}
        >
          {footer}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

interface DropSeatTileProps {
  src: string;
  label: string;
  disabled?: boolean;
  /** Cover badge when this seat fronts the drop. */
  selected?: boolean;
  onRemove?: () => void;
  /** When set, zoom footer offers “Set as cover”. */
  onSetCover?: () => void;
}

/** One seat tile — Mage × to remove, tap to zoom. */
export function DropSeatTile({
  src,
  label,
  disabled,
  selected,
  onRemove,
  onSetCover,
}: DropSeatTileProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <div className={`drop-cover-seat-shell${selected ? ' is-selected' : ''}`}>
      <button
        type="button"
        className={`drop-cover-seat drop-cover-seat--zoom${
          selected ? ' is-selected' : ''
        }`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={zoomOpen}
        disabled={disabled}
        onClick={() => setZoomOpen(true)}
      >
        <img src={src} alt="" />
        {selected ? <span className="drop-cover-seat-badge">Cover</span> : null}
      </button>
      {onRemove ? (
        <button
          type="button"
          className="drop-cover-seat-remove"
          disabled={disabled}
          aria-label={`Remove ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <MultiplyIcon className="drop-cover-seat-remove-icon" aria-hidden />
        </button>
      ) : null}
      <DropImageLightbox
        open={zoomOpen}
        src={src}
        label={label}
        onClose={() => setZoomOpen(false)}
        footer={
          onSetCover ? (
            selected ? (
              <span className="scarce-card-lightbox-action is-selected">
                Cover
              </span>
            ) : (
              <button
                type="button"
                className="scarce-card-lightbox-action"
                disabled={disabled}
                onClick={() => {
                  onSetCover();
                  setZoomOpen(false);
                }}
              >
                Set as cover
              </button>
            )
          ) : undefined
        }
      />
    </div>
  );
}

interface DropArtworkPreviewProps {
  src: string;
  /** Accessible name for the thumb + dialog. */
  label?: string;
}

/** Single-artwork create-drop thumb (seat size + zoom). */
export function DropArtworkPreview({
  src,
  label = 'Artwork preview',
}: DropArtworkPreviewProps) {
  return (
    <div className="drop-cover-seat-grid" aria-label={label}>
      <DropSeatTile src={src} label={label} />
    </div>
  );
}
