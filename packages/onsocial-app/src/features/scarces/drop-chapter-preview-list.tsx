'use client';

import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import { chapterTitleFromFile } from '@/features/scarces/drop-writing';
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
 * Local Markdown chapter list for Writing create — remove and (for books)
 * drag to set reading order before chapters are pinned into the manifesto.
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
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const canSort = sortable && files.length > 1 && Boolean(onReorder);

  useEffect(() => {
    dragFromRef.current = dragFrom;
  }, [dragFrom]);

  function clearDrag() {
    setDragFrom(null);
    setInsertAt(null);
    dragFromRef.current = null;
  }

  function onDragStart(index: number, event: ReactDragEvent) {
    if (!canSort || disabled) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    setDragFrom(index);
    dragFromRef.current = index;
  }

  function onListDragOver(event: ReactDragEvent) {
    if (!canSort || disabled || dragFromRef.current == null) return;
    event.preventDefault();
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('[data-chapter-index]')
    );
    let next = files.length;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (event.clientY < mid) {
        next = Number(row.dataset.chapterIndex);
        break;
      }
    }
    setInsertAt(next);
  }

  function onDragEnd() {
    const from = dragFromRef.current;
    const at = insertAt;
    clearDrag();
    if (from == null || at == null || !onReorder) return;
    const next = reorderByInsert(files, from, at);
    if (next !== files) onReorder(next);
  }

  return (
    <ul
      ref={listRef}
      className="drop-chapter-preview-list"
      onDragOver={onListDragOver}
      onDrop={(event) => {
        event.preventDefault();
        onDragEnd();
      }}
    >
      {files.map((file, index) => {
        const key = fileKey(file);
        const title = chapterTitleFromFile(file);
        const isDragging = dragFrom === index;
        return (
          <li
            key={key}
            data-chapter-index={index}
            className={`drop-chapter-preview-row${
              isDragging ? ' is-dragging' : ''
            }${insertAt === index ? ' is-insert-before' : ''}`}
            draggable={canSort && !disabled}
            onDragStart={(event) => onDragStart(index, event)}
            onDragEnd={onDragEnd}
          >
            <span className="drop-chapter-preview-index" aria-hidden>
              {index + 1}
            </span>
            <span className="drop-chapter-preview-title">{title}</span>
            <span className="drop-chapter-preview-name">{file.name}</span>
            <button
              type="button"
              className="drop-chapter-preview-remove"
              disabled={disabled}
              aria-label={`Remove ${title}`}
              onClick={() => onRemove(index)}
            >
              <MultiplyIcon aria-hidden />
            </button>
          </li>
        );
      })}
      {insertAt === files.length && canSort ? (
        <li className="drop-chapter-preview-insert-end" aria-hidden />
      ) : null}
    </ul>
  );
}
