'use client';

/**
 * Seat-tile artwork thumbs for create-drop — same size as variation sets,
 * Mage remove control, tap-to-zoom with the shared OsPageSheet overlay.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  MultiplyIcon,
  OsPageSheet,
  OsSheetAction,
  OsSheetActions,
  SheetCloseButton,
} from '@onsocial/ui';
import {
  DROP_SET_REORDER_HOLD_MS,
  dropCreatePiecePickerClass,
  dropSetReorderIntent,
} from '@/features/scarces/drop-create-layout';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

interface DropArtOverlayProps {
  open: boolean;
  label: string;
  onClose: () => void;
  /** After the OsPageSheet exit animation unmounts. */
  onClosed?: () => void;
  closeAriaLabel?: string;
  /** Raster zoom. Omit when `svg` or `children` is the stage. */
  src?: string;
  /** Inline SVG (text cards). Nested https faces work in DOM SVG, not img. */
  svg?: string | null;
  /** Custom stage (video frame picker). Wins over `src` / `svg`. */
  children?: ReactNode;
  /** Optional action under the zoomed art (e.g. Use in cover). */
  footer?: ReactNode;
  /** When set, show prev chevron + ← key. */
  onPrev?: () => void;
  /** When set, show next chevron + → key. */
  onNext?: () => void;
  /**
   * Surface material:
   * - `'page'` (default): Solid opaque canvas (`--bg`). Zero distraction / bleed through. Best for high-contrast art.
   * - `'glass'`: Atmospheric frosted blur scrim.
   *
   * Page fill is pinned to `--bg` on the panel (art is never a mood wash).
   * OsPageSheet `surface="page"` is an opaque canvas; `glass` is frost.
   */
  surface?: 'page' | 'glass';
}

function stopSheetClick(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/** Shared zoom dialog inside OS container — uses OsPageSheet overlay. */
export function DropArtOverlay({
  open,
  src,
  svg,
  children,
  label,
  onClose,
  onClosed,
  closeAriaLabel = 'Close preview',
  footer,
  onPrev,
  onNext,
  surface = 'page',
}: DropArtOverlayProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && onPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onPrev, onNext]);

  const hasNav = Boolean(onPrev || onNext);
  const inlineSvg = svg?.trim() || null;
  const rasterSrc = src?.trim() || null;
  const pageFillStyle: CSSProperties | undefined =
    surface === 'page'
      ? ({
          background: 'var(--bg)',
          ['--mood-bg']: 'var(--bg)',
        } as CSSProperties)
      : undefined;

  return (
    <OsPageSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      surface={surface}
      presentation="appear"
      keepDock
      zIndex={SCARCE_Z.nestedOverCommerce}
      ariaLabelledBy={titleId}
      backdropLabel={`Close ${label}`}
      panelClassName="drop-art-page-sheet-panel"
      bodyClassName="drop-art-page-sheet-body"
      {...(pageFillStyle ? { panelStyle: pageFillStyle } : {})}
      header={
        <div className="drop-art-overlay-chrome">
          <SheetCloseButton
            onClick={onClose}
            ariaLabel={closeAriaLabel}
            className="drop-art-overlay-close"
          />
        </div>
      }
    >
      <div className="drop-art-page-sheet-content" onClick={onClose}>
        <p id={titleId} className="sr-only">
          {label}
        </p>
        <div className="drop-art-overlay-stack" onClick={stopSheetClick}>
          {children ? (
            <div className="drop-art-overlay-stage">{children}</div>
          ) : (
            <div className="drop-art-overlay-stage">
              {inlineSvg ? (
                <div
                  className="drop-art-overlay-asset drop-art-overlay-svg"
                  dangerouslySetInnerHTML={{ __html: inlineSvg }}
                />
              ) : rasterSrc ? (
                <img
                  key={rasterSrc}
                  className="drop-art-overlay-asset"
                  src={rasterSrc}
                  alt=""
                />
              ) : null}
            </div>
          )}
          {hasNav && !children ? (
            <div
              className="drop-art-overlay-nav-row"
              role="group"
              aria-label="Cover style"
            >
              {onPrev ? (
                <button
                  type="button"
                  className="drop-art-overlay-nav drop-art-overlay-nav--prev"
                  aria-label="Previous"
                  onClick={onPrev}
                >
                  ‹
                </button>
              ) : (
                <span className="drop-art-overlay-nav-spacer" aria-hidden />
              )}
              {onNext ? (
                <button
                  type="button"
                  className="drop-art-overlay-nav drop-art-overlay-nav--next"
                  aria-label="Next"
                  onClick={onNext}
                >
                  ›
                </button>
              ) : (
                <span className="drop-art-overlay-nav-spacer" aria-hidden />
              )}
            </div>
          ) : null}
          {footer ? (
            <div className="drop-art-overlay-footer">{footer}</div>
          ) : null}
        </div>
      </div>
    </OsPageSheet>
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
  /** Press-and-move reorder. A short move lifts the piece; a tap still zooms. */
  reorderable?: boolean;
  isDragging?: boolean;
  /** Kept for callers that still mark a gap. The set page uses a moving slot. */
  isInsertTarget?: boolean;
  /** Kept for callers that still mark a gap. The set page uses a moving slot. */
  isInsertAfter?: boolean;
  onReorderArm?: () => void;
  onReorderMove?: (clientX: number, clientY: number) => void;
  onReorderEnd?: (clientX: number, clientY: number) => void;
  onReorderCancel?: () => void;
  /** Stable seat index for the set grid, used while a drag reorders the DOM. */
  tileIndex?: number;
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
  onReorderArm,
  onReorderMove,
  onReorderEnd,
  onReorderCancel,
  tileIndex,
}: DropSeatTileProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const suppressZoomClickRef = useRef(false);
  const armedRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const originRef = useRef({
    x: 0,
    y: 0,
    pointerId: -1,
    type: 'mouse',
    at: 0,
  });

  const listenersRef = useRef<(() => void) | null>(null);

  const touchBlockRef = useRef<(() => void) | null>(null);

  function clearHold() {
    if (holdTimerRef.current == null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }

  function stopListening() {
    clearHold();
    touchBlockRef.current?.();
    touchBlockRef.current = null;
    listenersRef.current?.();
    listenersRef.current = null;
  }

  function blockTouchScroll() {
    if (touchBlockRef.current) return;
    const stop = (event: TouchEvent) => {
      event.preventDefault();
    };
    document.addEventListener('touchmove', stop, { passive: false });
    touchBlockRef.current = () => {
      document.removeEventListener('touchmove', stop);
    };
  }

  function arm(pointerId: number) {
    if (armedRef.current) return;
    const button = buttonRef.current;
    if (!button) return;
    armedRef.current = true;
    suppressZoomClickRef.current = true;
    clearHold();
    blockTouchScroll();
    try {
      button.setPointerCapture(pointerId);
    } catch {
      // Capture can fail if the pointer already ended.
    }
    onReorderArm?.();
  }

  useEffect(() => {
    if (!isDragging) return;
    const stopScroll = (event: TouchEvent) => {
      event.preventDefault();
    };
    document.addEventListener('touchmove', stopScroll, { passive: false });
    return () => document.removeEventListener('touchmove', stopScroll);
  }, [isDragging]);

  useEffect(() => () => stopListening(), []);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!reorderable || disabled || event.button !== 0) return;
    const pointerId = event.pointerId;
    originRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId,
      type: event.pointerType,
      at: performance.now(),
    };
    armedRef.current = false;
    stopListening();

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const origin = originRef.current;
      const dx = move.clientX - origin.x;
      const dy = move.clientY - origin.y;
      const held = performance.now() - origin.at >= DROP_SET_REORDER_HOLD_MS;
      const intent = dropSetReorderIntent(origin.type, dx, dy, held);
      if (!armedRef.current) {
        if (intent === 'cancel') {
          originRef.current.pointerId = -1;
          stopListening();
          return;
        }
        if (intent === 'arm') {
          arm(pointerId);
          move.preventDefault();
          onReorderMove?.(move.clientX, move.clientY);
        }
        return;
      }
      move.preventDefault();
      onReorderMove?.(move.clientX, move.clientY);
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      const wasArmed = armedRef.current;
      armedRef.current = false;
      stopListening();
      if (!wasArmed) return;
      if (up.type === 'pointercancel') onReorderCancel?.();
      else onReorderEnd?.(up.clientX, up.clientY);
      window.setTimeout(() => {
        suppressZoomClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    listenersRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    if (event.pointerType === 'mouse') return;
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      const origin = originRef.current;
      if (origin.pointerId !== pointerId || armedRef.current) return;
      if (dropSetReorderIntent(origin.type, 0, 0, true) === 'arm') {
        arm(pointerId);
      }
    }, DROP_SET_REORDER_HOLD_MS);
  }

  return (
    <div
      data-set-tile
      data-seat-index={tileIndex}
      className={`drop-cover-seat-shell${selected ? ' is-selected' : ''}${
        isDragging ? ' is-dragging' : ''
      }${isInsertTarget ? ' is-insert-target' : ''}${
        isInsertAfter ? ' is-insert-after' : ''
      }${reorderable ? ' is-reorderable' : ''}`}
    >
      <button
        ref={buttonRef}
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
        draggable={false}
        onDragStart={
          reorderable
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
        onPointerDown={reorderable ? onPointerDown : undefined}
        onContextMenu={
          reorderable
            ? (event) => {
                event.preventDefault();
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
        <img src={src} alt="" draggable={false} />
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
      <DropArtOverlay
        open={zoomOpen}
        src={src}
        label={label}
        onClose={() => setZoomOpen(false)}
        footer={
          onSetCover && !selected ? (
            <OsSheetActions
              className="drop-art-overlay-actions"
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
  /** Accessible name for the stage + dialog. */
  label?: string;
  disabled?: boolean;
}

/** Same 1×1 well as empty — tap to zoom. */
export function DropArtworkPreview({
  src,
  label = 'Artwork preview',
  disabled,
}: DropArtworkPreviewProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`${dropCreatePiecePickerClass()} has-media`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={zoomOpen}
        disabled={disabled}
        onClick={() => setZoomOpen(true)}
      >
        <img src={src} alt="" />
      </button>
      <DropArtOverlay
        open={zoomOpen}
        src={src}
        label={label}
        onClose={() => setZoomOpen(false)}
      />
    </>
  );
}
