'use client';

/**
 * Seat-tile artwork thumbs for create-drop — same size as variation sets,
 * Mage remove control, tap-to-zoom with the shared scarce card lightbox.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import {
  MultiplyIcon,
  OsPageSheet,
  OsSheetAction,
  OsSheetActions,
  SheetCloseButton,
} from '@onsocial/ui';
import { dropCreatePiecePickerClass } from '@/features/scarces/drop-create-layout';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

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
  /**
   * Surface material:
   * - `'page'` (default): Solid opaque canvas (`--bg`). Zero distraction / bleed through. Best for high-contrast art.
   * - `'glass'`: Atmospheric frosted blur scrim.
   */
  surface?: 'page' | 'glass';
}

/** Shared zoom dialog inside OS container — uses OsPageSheet overlay. */
export function DropImageLightbox({
  open,
  src,
  label,
  onClose,
  footer,
  onPrev,
  onNext,
  surface = 'page',
}: DropImageLightboxProps) {
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

  return (
    <OsPageSheet
      open={open}
      onClose={onClose}
      surface={surface}
      presentation="appear"
      zIndex={SCARCE_Z.nestedOverCommerce}
      ariaLabelledBy={titleId}
      backdropLabel={`Close ${label} preview`}
      panelClassName="drop-art-page-sheet-panel"
      bodyClassName="drop-art-page-sheet-body"
      header={
        <div className="scarce-card-lightbox-chrome">
          <SheetCloseButton
            onClick={onClose}
            ariaLabel="Close preview"
            className="scarce-card-lightbox-close"
          />
        </div>
      }
      footer={
        footer ? (
          <div
            className="scarce-card-lightbox-footer"
            onClick={(event) => event.stopPropagation()}
          >
            {footer}
          </div>
        ) : null
      }
    >
      <div className="drop-art-page-sheet-content" onClick={onClose}>
        <p id={titleId} className="sr-only">
          {label}
        </p>
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
      <DropImageLightbox
        open={zoomOpen}
        src={src}
        label={label}
        onClose={() => setZoomOpen(false)}
      />
    </>
  );
}
