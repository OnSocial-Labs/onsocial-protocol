'use client';

import {
  Fragment,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { Divider, MultiplyIcon } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { chapterTitleFromFile, isWritingPdfMime } from '@/features/scarces/drop-writing';
import { reorderByInsert } from '@/features/scarces/drop-track-order';

interface DropChapterPreviewListProps {
  files: File[];
  disabled?: boolean;
  /** When true (book), rows can be dragged to set chapter order. */
  sortable?: boolean;
  onRemove: (index: number) => void;
  onReorder?: (files: File[]) => void;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Local Markdown chapter list for Writing create — same row chrome and
 * drag-reorder behavior as Music tracks.
 */
export function DropChapterPreviewList({
  files,
  disabled = false,
  sortable = false,
  onRemove,
  onReorder,
}: DropChapterPreviewListProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** Gap to insert into while dragging (0…files.length), or null. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const canSort = sortable && files.length > 1 && Boolean(onReorder);
  const showLineAt = dragFrom != null ? insertAt : null;

  function finishDragVisual() {
    setDragFrom(null);
    setInsertAt(null);
  }

  function clearDragFromRef() {
    // Spec: drop fires before dragend. Some engines reverse that — keep the
    // index alive for one turn so onListDrop can still read it.
    queueMicrotask(() => {
      dragFromRef.current = null;
    });
  }

  function allowListDrop(event: ReactDragEvent) {
    if (!canSort || disabled || dragFromRef.current == null) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    return true;
  }

  function gapFromPointer(clientY: number): number {
    const list = listRef.current;
    if (!list) return 0;
    const rows = list.querySelectorAll<HTMLElement>('[data-chapter-row]');
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  }

  function onTitleDragStart(index: number, event: ReactDragEvent) {
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

  function onTitleDragEnd() {
    finishDragVisual();
    clearDragFromRef();
  }

  function onListDragOver(event: ReactDragEvent) {
    if (!allowListDrop(event)) return;
    const from = dragFromRef.current;
    if (from == null) return;
    const gap = gapFromPointer(event.clientY);
    const noop = gap === from || gap === from + 1;
    setInsertAt(noop ? null : gap);
  }

  function onListDrop(event: ReactDragEvent) {
    if (!canSort || disabled || !onReorder) return;
    event.preventDefault();
    const raw = event.dataTransfer.getData('text/plain');
    const fromData = raw === '' ? Number.NaN : Number(raw);
    const from =
      dragFromRef.current ??
      (Number.isSafeInteger(fromData) ? fromData : null);
    const gap = insertAt ?? gapFromPointer(event.clientY);
    finishDragVisual();
    dragFromRef.current = null;
    if (from == null || from < 0 || from >= files.length) return;
    const next = reorderByInsert(files, from, gap);
    if (next !== files) onReorder(next);
  }

  return (
    <ul
      ref={listRef}
      className={`drop-track-list${dragFrom != null ? ' is-reordering' : ''}`}
      aria-label="Chapters"
      onDragEnter={allowListDrop}
      onDragOver={onListDragOver}
      onDrop={onListDrop}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && listRef.current?.contains(next)) {
          return;
        }
        setInsertAt(null);
      }}
    >
      {files.map((file, index) => {
        const key = fileKey(file);
        const title = chapterTitleFromFile(file);
        const isDragging = dragFrom === index;
        return (
          <Fragment key={key}>
            {showLineAt === index ? (
              <li className="drop-track-insert-slot" aria-hidden>
                <Divider variant="detail" />
              </li>
            ) : null}
            <li
              data-chapter-row
              data-chapter-index={index}
              className={`drop-track-list-row${
                isDragging ? ' is-dragging' : ''
              }`}
            >
              <div className="drop-track-list-main">
                <span
                  className={`drop-track-list-title${
                    canSort ? ' is-sortable' : ''
                  }`}
                  title={
                    canSort ? `${file.name} · drag to reorder` : file.name
                  }
                  {...(canSort && !disabled
                    ? {
                        draggable: true,
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': `Drag to reorder ${title}`,
                        onDragStart: (event: ReactDragEvent) =>
                          onTitleDragStart(index, event),
                        onDragEnd: onTitleDragEnd,
                      }
                    : {})}
                >
                  {index + 1}. {title}
                </span>
                <span className="drop-chapter-kind" aria-hidden>
                  {isWritingPdfMime(file.type, file.name) ? 'PDF' : 'MD'}
                </span>
                <OsSheetActions
                  layout="row-compact"
                  tone="frosted-primary"
                  borderless
                  className="hub-publish-request-actions drop-track-list-remove-actions"
                >
                  <OsSheetAction
                    type="button"
                    variant="danger"
                    ready={!disabled}
                    disabled={disabled}
                    aria-label={`Remove ${title}`}
                    className="hub-publish-request-dismiss"
                    onClick={() => onRemove(index)}
                  >
                    <MultiplyIcon
                      className="hub-publish-request-dismiss-icon"
                      aria-hidden
                    />
                  </OsSheetAction>
                </OsSheetActions>
              </div>
            </li>
          </Fragment>
        );
      })}
      {showLineAt === files.length ? (
        <li className="drop-track-insert-slot" aria-hidden>
          <Divider variant="detail" />
        </li>
      ) : null}
    </ul>
  );
}
