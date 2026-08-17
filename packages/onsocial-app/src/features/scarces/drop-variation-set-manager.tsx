'use client';

/**
 * Variation set on create-drop: one compact strip on the form, full manage
 * slide-over for zoom / Main / remove / drag-reorder (small sets only).
 */

import { useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { DropSeatTile } from '@/features/scarces/drop-artwork-preview';
import { reorderByInsert } from '@/features/scarces/drop-track-order';

/** First-row strip on the create form — rest live in the manage slide-over. */
export const VARIATION_SET_STRIP_LIMIT = 4;

interface DropVariationSetManagerProps {
  /** Object-URL previews (may be capped for large uploads). */
  previews: string[];
  /** True seat count (files.length), may exceed previews.length. */
  totalCount: number;
  /** 1-based cover seat. */
  coverSeat: number;
  disabled?: boolean;
  /**
   * Drag reorder when the whole set is in-browser (≤ direct-attach ceiling).
   * Large CID/zip sets stay selection-order only.
   */
  sortable?: boolean;
  canAddMore?: boolean;
  onRemove: (index: number) => void;
  /** New file order after drag — caller remaps cover seat + syncs previews. */
  onReorder?: (from: number, insertAt: number) => void;
  onSetCover: (seat: number) => void;
  onAddMore: () => void;
  onReplace: () => void;
}

/**
 * Compact strip + full-screen manage slide-over for variation seat art.
 */
export function DropVariationSetManager({
  previews,
  totalCount,
  coverSeat,
  disabled = false,
  sortable = false,
  canAddMore = true,
  onRemove,
  onReorder,
  onSetCover,
  onAddMore,
  onReplace,
}: DropVariationSetManagerProps) {
  const [manageOpen, setManageOpen] = useState(false);

  const canSort =
    sortable &&
    previews.length > 1 &&
    previews.length === totalCount &&
    Boolean(onReorder);

  const dragFromRef = useRef<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  function finishDragVisual() {
    setDragFrom(null);
    setInsertAt(null);
  }

  function clearDragFromRef() {
    queueMicrotask(() => {
      dragFromRef.current = null;
    });
  }

  function allowGridDrop(event: ReactDragEvent) {
    if (!canSort || disabled || dragFromRef.current == null) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    return true;
  }

  /** Gap index 0…n from pointer — insert before that tile (or end). */
  function gapFromPointer(clientX: number, clientY: number): number {
    const grid = gridRef.current;
    if (!grid) return 0;
    const tiles = grid.querySelectorAll<HTMLElement>('[data-set-tile]');
    if (tiles.length === 0) return 0;

    let best = tiles.length;
    let bestDist = Number.POSITIVE_INFINITY;
    tiles.forEach((tile, index) => {
      const rect = tile.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        const before =
          clientX < cx ||
          (Math.abs(clientX - cx) < rect.width * 0.15 && clientY < cy);
        best = before ? index : index + 1;
      }
    });
    return best;
  }

  function onTileDragStart(index: number, event: ReactDragEvent<HTMLElement>) {
    if (!canSort || disabled) {
      event.preventDefault();
      return;
    }
    dragFromRef.current = index;
    setDragFrom(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.dropEffect = 'move';
  }

  function onTileDragEnd() {
    finishDragVisual();
    clearDragFromRef();
  }

  function onGridDragOver(event: ReactDragEvent) {
    if (!allowGridDrop(event)) return;
    const from = dragFromRef.current;
    if (from == null) return;
    const gap = gapFromPointer(event.clientX, event.clientY);
    const noop = gap === from || gap === from + 1;
    setInsertAt(noop ? null : gap);
  }

  function commitReorder(gap: number) {
    if (!canSort || disabled || !onReorder) return;
    const from = dragFromRef.current;
    finishDragVisual();
    dragFromRef.current = null;
    if (from == null || from < 0 || from >= previews.length) return;
    if (gap === from || gap === from + 1) return;
    const probe = reorderByInsert(
      previews.map((_, i) => i),
      from,
      gap
    );
    if (probe.every((v, i) => v === i)) return;
    onReorder(from, gap);
  }

  function onGridDrop(event: ReactDragEvent) {
    if (!canSort || disabled || !onReorder) return;
    event.preventDefault();
    const raw = event.dataTransfer.getData('text/plain');
    const fromData = raw === '' ? Number.NaN : Number(raw);
    if (dragFromRef.current == null && Number.isSafeInteger(fromData)) {
      dragFromRef.current = fromData;
    }
    const gap = insertAt ?? gapFromPointer(event.clientX, event.clientY);
    commitReorder(gap);
  }

  const strip = previews.slice(0, VARIATION_SET_STRIP_LIMIT);
  const overflow = Math.max(0, totalCount - strip.length);
  const previewCapped = previews.length < totalCount;

  const pieceLabel = `${totalCount.toLocaleString()} ${
    totalCount === 1 ? 'piece' : 'pieces'
  }`;
  const manageSubtitle = canSort
    ? `${pieceLabel} · drag to reorder`
    : pieceLabel;

  const hint = canSort
    ? 'Drag to set mint order. Main fronts the packaging cover — each mint keeps its own art.'
    : previewCapped
      ? `Showing the first ${previews.length.toLocaleString()} of ${totalCount.toLocaleString()}. Order follows your file selection — the whole set pins when you start.`
      : 'Main fronts the packaging cover — each mint keeps its own art.';

  return (
    <div className="guild-field drop-variation-set-field">
      <span>
        Your set · {pieceLabel}
      </span>
      <div
        className="drop-cover-seat-grid drop-variation-set-strip"
        aria-label="Set preview"
      >
        {strip.map((src, index) => {
          const seat = index + 1;
          return (
            <DropSeatTile
              key={`${src}:${seat}`}
              src={src}
              label={`Piece ${seat}`}
              disabled={disabled}
              selected={coverSeat === seat}
              onSetCover={() => onSetCover(seat)}
            />
          );
        })}
        {overflow > 0 ? (
          <button
            type="button"
            className="drop-cover-seat-shell drop-variation-set-overflow"
            disabled={disabled}
            aria-label={`Manage set, ${overflow.toLocaleString()} more pieces`}
            onClick={() => setManageOpen(true)}
          >
            <span className="drop-variation-set-overflow-label">
              +{overflow.toLocaleString()}
            </span>
          </button>
        ) : null}
      </div>
      <div
        className="app-storage-presets"
        role="group"
        aria-label="Set actions"
      >
        <button
          type="button"
          className="os-surface-chip"
          disabled={disabled}
          onClick={() => setManageOpen(true)}
        >
          Manage set
        </button>
        <button
          type="button"
          className="os-surface-chip"
          disabled={disabled || !canAddMore}
          onClick={onAddMore}
        >
          Add more
        </button>
        <button
          type="button"
          className="os-surface-chip"
          disabled={disabled}
          onClick={onReplace}
        >
          Replace set
        </button>
      </div>
      <small>{hint}</small>

      <OsSlideOverScreen
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title="Your set"
        subtitle={manageSubtitle}
        closeAriaLabel="Back to drop"
        className="drop-variation-set-slide"
        footer={
          <div
            className="drop-variation-set-slide-footer app-storage-presets"
            role="group"
            aria-label="Set actions"
          >
            <button
              type="button"
              className="os-surface-chip"
              disabled={disabled || !canAddMore}
              onClick={onAddMore}
            >
              Add more
            </button>
            <button
              type="button"
              className="os-surface-chip"
              disabled={disabled}
              onClick={onReplace}
            >
              Replace set
            </button>
          </div>
        }
      >
        <div
          ref={gridRef}
          className={`drop-cover-seat-grid drop-variation-set-slide-grid${
            dragFrom != null ? ' is-reordering' : ''
          }`}
          aria-label="All pieces"
          onDragEnter={allowGridDrop}
          onDragOver={onGridDragOver}
          onDrop={onGridDrop}
          onDragLeave={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && gridRef.current?.contains(next)) {
              return;
            }
            setInsertAt(null);
          }}
        >
          {previews.map((src, index) => {
            const seat = index + 1;
            return (
              <DropSeatTile
                key={`${src}:${seat}`}
                src={src}
                label={`Piece ${seat}`}
                disabled={disabled}
                selected={coverSeat === seat}
                reorderable={canSort}
                isDragging={dragFrom === index}
                isInsertTarget={insertAt === index}
                isInsertAfter={
                  insertAt === previews.length && index === previews.length - 1
                }
                onRemove={() => onRemove(index)}
                onSetCover={() => onSetCover(seat)}
                onReorderDragStart={(event) => onTileDragStart(index, event)}
                onReorderDragEnd={onTileDragEnd}
                onReorderDragOver={(event) => {
                  if (!allowGridDrop(event)) return;
                  const from = dragFromRef.current;
                  if (from == null) return;
                  const gap = gapFromPointer(event.clientX, event.clientY);
                  const noop = gap === from || gap === from + 1;
                  setInsertAt(noop ? null : gap);
                }}
                onReorderDrop={(event) => {
                  if (!canSort || disabled) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const gap =
                    insertAt ?? gapFromPointer(event.clientX, event.clientY);
                  commitReorder(gap);
                }}
              />
            );
          })}
        </div>
      </OsSlideOverScreen>
    </div>
  );
}
