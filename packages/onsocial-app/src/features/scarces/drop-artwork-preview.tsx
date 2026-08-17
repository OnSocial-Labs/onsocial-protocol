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
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  MultiplyIcon,
  OsSheetAction,
  OsSheetActions,
  SheetCloseButton,
  useScrollLock,
} from '@onsocial/ui';
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
  /** Optional action under the zoomed art (e.g. Use in cover). */
  footer?: ReactNode;
  /** When set, show prev chevron + ← key. */
  onPrev?: () => void;
  /** When set, show next chevron + → key. */
  onNext?: () => void;
}

/** Shared zoom dialog — same chrome as feed / list scarce previews. */
export function DropImageLightbox({
  open,
  src,
  label,
  onClose,
  footer,
  onPrev,
  onNext,
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
        return;
      }
      if (event.key === 'ArrowLeft' && onPrev) {
        event.preventDefault();
        onPrev();
        return;
      }
      if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, requestClose, onPrev, onNext]);

  if (!mounted || (!open && !closing)) return null;

  const hasNav = Boolean(onPrev || onNext);

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
      <div
        className={`scarce-card-lightbox-stage${hasNav ? ' has-nav' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <img
          key={src}
          className="scarce-card-lightbox-asset"
          src={src}
          alt=""
        />
        {hasNav ? (
          <div
            className="scarce-card-lightbox-nav-row"
            role="group"
            aria-label="Cover style"
          >
            {onPrev ? (
              <button
                type="button"
                className="scarce-card-lightbox-nav scarce-card-lightbox-nav--prev"
                aria-label="Previous"
                onClick={onPrev}
              >
                ‹
              </button>
            ) : (
              <span className="scarce-card-lightbox-nav-spacer" aria-hidden />
            )}
            {onNext ? (
              <button
                type="button"
                className="scarce-card-lightbox-nav scarce-card-lightbox-nav--next"
                aria-label="Next"
                onClick={onNext}
              >
                ›
              </button>
            ) : (
              <span className="scarce-card-lightbox-nav-spacer" aria-hidden />
            )}
          </div>
        ) : null}
      </div>
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
  /** Main badge when this seat fronts the drop. */
  selected?: boolean;
  onRemove?: () => void;
  /** When set, zoom footer offers “Use in cover” for non-main pieces. */
  onSetCover?: () => void;
  /**
   * HTML5 drag reorder (manage-set sheet). Drag starts on the art button;
   * a completed drag suppresses the following click-to-zoom.
   */
  reorderable?: boolean;
  isDragging?: boolean;
  /** Insert-before highlight while another tile is dragged over this one. */
  isInsertTarget?: boolean;
  /** Insert-after highlight on the last tile when dropping at the end. */
  isInsertAfter?: boolean;
  onReorderDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
  onReorderDragEnd?: () => void;
  onReorderDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onReorderDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}

/** One seat tile — Mage × to remove, tap to zoom. */
export function DropSeatTile({
  src,
  label,
  disabled,
  selected,
  onRemove,
  onSetCover,
  reorderable = false,
  isDragging = false,
  isInsertTarget = false,
  isInsertAfter = false,
  onReorderDragStart,
  onReorderDragEnd,
  onReorderDragOver,
  onReorderDrop,
}: DropSeatTileProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const suppressZoomClickRef = useRef(false);

  return (
    <div
      data-set-tile
      className={`drop-cover-seat-shell${selected ? ' is-selected' : ''}${
        isDragging ? ' is-dragging' : ''
      }${isInsertTarget ? ' is-insert-target' : ''}${
        isInsertAfter ? ' is-insert-after' : ''
      }${reorderable ? ' is-reorderable' : ''}`}
      onDragOver={reorderable ? onReorderDragOver : undefined}
      onDrop={reorderable ? onReorderDrop : undefined}
    >
      <button
        type="button"
        className={`drop-cover-seat drop-cover-seat--zoom${
          selected ? ' is-selected' : ''
        }`}
        aria-label={
          selected
            ? `${label}, main piece`
            : reorderable
              ? `${label} · drag to reorder`
              : label
        }
        aria-haspopup="dialog"
        aria-expanded={zoomOpen}
        disabled={disabled}
        draggable={reorderable && !disabled}
        onDragStart={
          reorderable
            ? (event) => {
                suppressZoomClickRef.current = false;
                onReorderDragStart?.(event);
              }
            : undefined
        }
        onDrag={() => {
          if (reorderable) suppressZoomClickRef.current = true;
        }}
        onDragEnd={
          reorderable
            ? () => {
                onReorderDragEnd?.();
                // Click can fire after dragend — swallow one zoom open.
                window.setTimeout(() => {
                  suppressZoomClickRef.current = false;
                }, 0);
              }
            : undefined
        }
        onClick={() => {
          if (suppressZoomClickRef.current) {
            suppressZoomClickRef.current = false;
            return;
          }
          setZoomOpen(true);
        }}
      >
        <img src={src} alt="" />
        {selected ? <span className="drop-cover-seat-badge">Main</span> : null}
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
          onSetCover && !selected ? (
            <OsSheetActions
              className="scarce-card-lightbox-actions"
              layout="row-compact"
              tone="frosted-primary"
              borderless
            >
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                disabled={disabled}
                onClick={() => {
                  onSetCover();
                  setZoomOpen(false);
                }}
              >
                Use in cover
              </OsSheetAction>
            </OsSheetActions>
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
