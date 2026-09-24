'use client';

/**
 * Variation set on create-drop: one compact strip on the form, full manage
 * slide-over for zoom / Main / remove / drag-reorder (small sets only).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeftIcon } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { DropSeatTile } from '@/features/scarces/drop-artwork-preview';
import { reorderByInsert } from '@/features/scarces/drop-track-order';

/** First-row strip on the create form — rest live in the manage slide-over. */
export const VARIATION_SET_STRIP_LIMIT = 4;

/** Undo a FLIP translate so hit-testing uses the landing slot, not the slide. */
function layoutShift(el: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') return { x: 0, y: 0 };
  const matrix = new DOMMatrix(transform);
  return { x: matrix.m41, y: matrix.m42 };
}

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
  const insertAtRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const positionsRef = useRef<Map<number, { left: number; top: number }>>(
    new Map()
  );
  const flipGen = useRef(0);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [ghostSize, setGhostSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const gridRef = useRef<HTMLDivElement | null>(null);

  function placeGhost(x: number, y: number) {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(1.06)`;
  }

  function snapshotPositions() {
    const grid = gridRef.current;
    if (!grid) return;
    const map = new Map<number, { left: number; top: number }>();
    grid.querySelectorAll<HTMLElement>('[data-seat-index]').forEach((el) => {
      const index = Number(el.dataset.seatIndex);
      if (!Number.isFinite(index)) return;
      const rect = el.getBoundingClientRect();
      const shift = layoutShift(el);
      map.set(index, {
        left: rect.left - shift.x,
        top: rect.top - shift.y,
      });
    });
    positionsRef.current = map;
  }

  function finishDragVisual() {
    flipGen.current += 1;
    gridRef.current
      ?.querySelectorAll<HTMLElement>('[data-seat-index]')
      .forEach((el) => {
        el.style.transition = '';
        el.style.transform = '';
      });
    setDragFrom(null);
    setInsertAt(null);
    insertAtRef.current = null;
    setGhostSize(null);
    pointerRef.current = null;
    positionsRef.current = new Map();
  }

  function clearDragFromRef() {
    queueMicrotask(() => {
      dragFromRef.current = null;
    });
  }

  /**
   * Gap in the original list (0…length) so the preview order matches the pointer.
   * The grid may already be showing that preview, so the DOM index is not the gap.
   */
  function gapFromPointer(clientX: number, clientY: number): number {
    const grid = gridRef.current;
    const from = dragFromRef.current;
    if (!grid) return 0;
    const tiles = [...grid.querySelectorAll<HTMLElement>('[data-seat-index]')];
    if (tiles.length === 0) return 0;

    let visualGap = tiles.length;
    let bestDist = Number.POSITIVE_INFINITY;
    tiles.forEach((tile, index) => {
      const rect = tile.getBoundingClientRect();
      const shift = layoutShift(tile);
      const cx = rect.left - shift.x + rect.width / 2;
      const cy = rect.top - shift.y + rect.height / 2;
      const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        const before =
          clientX < cx ||
          (Math.abs(clientX - cx) < rect.width * 0.15 && clientY < cy);
        visualGap = before ? index : index + 1;
      }
    });

    if (from == null) return visualGap;
    const visual = tiles.map((tile) => Number(tile.dataset.seatIndex));
    const fromVisual = visual.indexOf(from);
    const without = visual.filter((index) => index !== from);
    const slot =
      fromVisual >= 0 && fromVisual < visualGap ? visualGap - 1 : visualGap;
    if (slot >= without.length) return tiles.length;
    return slot >= from ? slot + 1 : slot;
  }

  function onTileReorderArm(index: number) {
    if (!canSort || disabled) return;
    const tile = gridRef.current?.querySelector<HTMLElement>(
      `[data-seat-index="${index}"]`
    );
    const rect = tile?.getBoundingClientRect();
    if (rect) {
      setGhostSize({ w: rect.width, h: rect.height });
      if (!pointerRef.current) {
        pointerRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    }
    snapshotPositions();
    dragFromRef.current = index;
    insertAtRef.current = null;
    setDragFrom(index);
    setInsertAt(null);
  }

  function onTileReorderMove(clientX: number, clientY: number) {
    if (!canSort || disabled || dragFromRef.current == null) return;
    pointerRef.current = { x: clientX, y: clientY };
    placeGhost(clientX, clientY);
    const from = dragFromRef.current;
    const gap = gapFromPointer(clientX, clientY);
    const next = gap === from || gap === from + 1 ? null : gap;
    if (next === insertAtRef.current) return;
    snapshotPositions();
    insertAtRef.current = next;
    setInsertAt(next);
  }

  function onTileReorderEnd(clientX: number, clientY: number) {
    commitReorder(gapFromPointer(clientX, clientY));
  }

  function onTileReorderCancel() {
    finishDragVisual();
    clearDragFromRef();
  }

  useEffect(() => {
    if (dragFrom == null) return;
    let frame = 0;
    const tick = () => {
      const grid = gridRef.current;
      const scroller = grid?.closest('.os-app-screen-body');
      const point = pointerRef.current;
      if (point && scroller instanceof HTMLElement) {
        const rect = scroller.getBoundingClientRect();
        const edge = 56;
        if (point.y < rect.top + edge) scroller.scrollTop -= 8;
        else if (point.y > rect.bottom - edge) scroller.scrollTop += 8;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [dragFrom]);

  useLayoutEffect(() => {
    if (dragFrom == null) return;
    const point = pointerRef.current;
    if (point) placeGhost(point.x, point.y);
    const grid = gridRef.current;
    if (!grid) return;
    const gen = ++flipGen.current;
    const prev = positionsRef.current;
    const next = new Map<number, { left: number; top: number }>();
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const tiles = grid.querySelectorAll<HTMLElement>('[data-seat-index]');
    tiles.forEach((el) => {
      const index = Number(el.dataset.seatIndex);
      const rect = el.getBoundingClientRect();
      const shift = layoutShift(el);
      const left = rect.left - shift.x;
      const top = rect.top - shift.y;
      next.set(index, { left, top });
      const before = prev.get(index);
      if (!before || reduce) return;
      const dx = before.left - left;
      const dy = before.top - top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });
    positionsRef.current = next;
    window.requestAnimationFrame(() => {
      if (flipGen.current !== gen) return;
      tiles.forEach((el) => {
        if (!el.style.transform) return;
        el.style.transition = 'transform 180ms ease';
        el.style.transform = '';
      });
    });
  }, [dragFrom, insertAt]);

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

  const visualIndexes =
    dragFrom == null || insertAt == null
      ? previews.map((_, index) => index)
      : reorderByInsert(
          previews.map((_, index) => index),
          dragFrom,
          insertAt
        );
  const strip = previews.slice(0, VARIATION_SET_STRIP_LIMIT);
  const overflow = Math.max(0, totalCount - strip.length);

  const pieceLabel = `${totalCount.toLocaleString()} ${
    totalCount === 1 ? 'piece' : 'pieces'
  }`;
  const manageSubtitle = canSort
    ? `${pieceLabel} · drag to reorder`
    : pieceLabel;

  return (
    <div className="guild-field drop-variation-set-field">
      <button
        type="button"
        className="drop-variation-set-open"
        disabled={disabled}
        onClick={() => setManageOpen(true)}
      >
        <span>Your set · {pieceLabel}</span>
      </button>
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
            aria-label={`Manage set, ${overflow.toLocaleString()} more ${
              overflow === 1 ? 'piece' : 'pieces'
            }`}
            onClick={() => setManageOpen(true)}
          >
            <span className="drop-variation-set-overflow-label">
              +{overflow.toLocaleString()}
            </span>
          </button>
        ) : null}
      </div>

      <OsSlideOverScreen
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title="Your set"
        subtitle={manageSubtitle}
        closeAriaLabel="Back"
        closeIcon={
          <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
        }
        className="drop-variation-set-slide"
        footer={
          <div
            className="app-storage-presets drop-variation-set-actions"
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
        >
          {visualIndexes.map((index) => {
            const src = previews[index]!;
            const seat = index + 1;
            return (
              <DropSeatTile
                key={index}
                tileIndex={index}
                src={src}
                label={`Piece ${seat}`}
                disabled={disabled}
                selected={coverSeat === seat}
                reorderable={canSort}
                isDragging={dragFrom === index}
                onRemove={() => onRemove(index)}
                onSetCover={() => onSetCover(seat)}
                onReorderArm={() => onTileReorderArm(index)}
                onReorderMove={onTileReorderMove}
                onReorderEnd={onTileReorderEnd}
                onReorderCancel={onTileReorderCancel}
              />
            );
          })}
        </div>
      </OsSlideOverScreen>
      {dragFrom != null && ghostSize
        ? createPortal(
            <div
              ref={ghostRef}
              className="drop-set-drag-ghost"
              style={{ width: ghostSize.w, height: ghostSize.h }}
              aria-hidden
            >
              <img src={previews[dragFrom]} alt="" draggable={false} />
              {coverSeat === dragFrom + 1 ? (
                <span className="drop-cover-seat-badge">Main</span>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
