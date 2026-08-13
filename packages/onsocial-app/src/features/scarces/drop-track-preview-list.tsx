'use client';

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  Divider,
  MultiplyIcon,
  PauseFillIcon,
  PlayFillIcon,
  osFieldSoftClassName,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import {
  DROP_LYRICS_MAX_CHARS,
  trackTitleFromFile,
} from '@/features/scarces/drop-audio';
import { reorderByInsert } from '@/features/scarces/drop-track-order';

interface DropTrackPreviewListProps {
  files: File[];
  /** Parallel to `files` — optional lyrics draft per track. */
  lyrics?: string[];
  disabled?: boolean;
  /** When true (album), rows can be dragged to set play order. */
  sortable?: boolean;
  onRemove: (index: number) => void;
  onReorder?: (files: File[], lyrics: string[]) => void;
  onLyricsChange?: (index: number, lyrics: string) => void;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function lyricsAt(lyrics: string[] | undefined, index: number): string {
  return lyrics?.[index] ?? '';
}

/**
 * Local-file track list for Music create — preview play/pause, remove,
 * optional lyrics, and (for albums) drag the title to set play order.
 *
 * Visual top→bottom order is `files` / `trackFiles`. That same array order
 * is what `uploadMany` pins into `extra.playable`.
 */
export function DropTrackPreviewList({
  files,
  lyrics,
  disabled = false,
  sortable = false,
  onRemove,
  onReorder,
  onLyricsChange,
}: DropTrackPreviewListProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef<Map<string, string>>(new Map());
  const dragFromRef = useRef<number | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** Gap to insert into while dragging (0…files.length), or null. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [lyricsOpen, setLyricsOpen] = useState<Set<number>>(() => new Set());
  const canSort = sortable && files.length > 1 && Boolean(onReorder);

  // Blob URLs keyed by file identity — survive reorder without remounting.
  useEffect(() => {
    const map = urlsRef.current;
    const live = new Set(files.map(fileKey));
    for (const [key, url] of map) {
      if (!live.has(key)) {
        URL.revokeObjectURL(url);
        map.delete(key);
      }
    }
    for (const file of files) {
      const key = fileKey(file);
      if (!map.has(key)) {
        map.set(key, URL.createObjectURL(file));
      }
    }
  }, [files]);

  useEffect(() => {
    const audio = audioRef.current;
    const urls = urlsRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        while (audio.firstChild) audio.removeChild(audio.firstChild);
        audio.load();
      }
      for (const url of urls.values()) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  async function toggle(index: number) {
    const audio = audioRef.current;
    const file = files[index];
    if (!audio || !file || disabled) return;
    const key = fileKey(file);
    const url = urlsRef.current.get(key);
    if (!url) return;

    if (playingKey === key && !audio.paused) {
      audio.pause();
      setPlayingKey(null);
      return;
    }

    try {
      if (playingKey !== key) {
        audio.pause();
        while (audio.firstChild) {
          audio.removeChild(audio.firstChild);
        }
        audio.removeAttribute('src');
        const source = document.createElement('source');
        source.src = url;
        if (file.type) source.type = file.type;
        audio.appendChild(source);
        audio.load();
      }
      setPlayingKey(key);
      await audio.play();
    } catch {
      setPlayingKey(null);
    }
  }

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
    const rows = list.querySelectorAll<HTMLElement>('[data-track-row]');
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
    // Keep the move cursor (avoid the red “not allowed” glyph).
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
    // Hide the line when it wouldn’t change order.
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
    const nextFiles = reorderByInsert(files, from, gap);
    if (nextFiles === files) return;
    const currentLyrics = files.map((_, i) => lyricsAt(lyrics, i));
    const nextLyrics = reorderByInsert(currentLyrics, from, gap);
    setLyricsOpen(new Set());
    onReorder(nextFiles, nextLyrics);
  }

  function toggleLyricsEditor(index: number) {
    setLyricsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const showLineAt = dragFrom != null ? insertAt : null;

  return (
    <>
      <ul
        ref={listRef}
        className={`drop-track-list${dragFrom != null ? ' is-reordering' : ''}`}
        aria-label="Tracks"
        onDragEnter={allowListDrop}
        onDragOver={onListDragOver}
        onDrop={onListDrop}
        onDragLeave={(event) => {
          // Leaving the list entirely — clear the insert line.
          const next = event.relatedTarget;
          if (next instanceof Node && listRef.current?.contains(next)) {
            return;
          }
          setInsertAt(null);
        }}
      >
        {files.map((file, index) => {
          const key = fileKey(file);
          const playing = playingKey === key;
          const title = trackTitleFromFile(file);
          const isDragging = dragFrom === index;
          const draft = lyricsAt(lyrics, index);
          const hasLyrics = Boolean(draft.trim());
          const editorOpen = lyricsOpen.has(index);
          return (
            <Fragment key={key}>
              {showLineAt === index ? (
                <li className="drop-track-insert-slot" aria-hidden>
                  <Divider variant="detail" />
                </li>
              ) : null}
              <li
                data-track-row
                className={`drop-track-list-row${isDragging ? ' is-dragging' : ''}${
                  editorOpen ? ' is-lyrics-open' : ''
                }`}
              >
                <div className="drop-track-list-main">
                  <button
                    type="button"
                    className={`drop-track-list-play${playing ? ' is-playing' : ''}`}
                    disabled={disabled}
                    aria-label={playing ? `Pause ${title}` : `Preview ${title}`}
                    onClick={() => {
                      void toggle(index);
                    }}
                  >
                    <span className="drop-track-list-icon" aria-hidden>
                      {playing ? (
                        <PauseFillIcon className="drop-track-list-play-icon drop-track-list-play-icon--pause" />
                      ) : (
                        <PlayFillIcon className="drop-track-list-play-icon drop-track-list-play-icon--play" />
                      )}
                    </span>
                  </button>
                  <span
                    className={`drop-track-list-title${canSort ? ' is-sortable' : ''}`}
                    {...(canSort && !disabled
                      ? {
                          draggable: true,
                          role: 'button',
                          tabIndex: 0,
                          title: 'Drag to reorder',
                          'aria-label': `Drag to reorder ${title}`,
                          onDragStart: (event: ReactDragEvent) =>
                            onTitleDragStart(index, event),
                          onDragEnd: onTitleDragEnd,
                        }
                      : {})}
                  >
                    {index + 1}. {title}
                  </span>
                  {onLyricsChange ? (
                    <button
                      type="button"
                      className={`drop-track-lyrics-toggle${
                        hasLyrics ? ' has-lyrics' : ''
                      }${editorOpen ? ' is-open' : ''}`}
                      disabled={disabled}
                      aria-expanded={editorOpen}
                      aria-controls={`drop-track-lyrics-${index}`}
                      onClick={() => toggleLyricsEditor(index)}
                    >
                      {hasLyrics ? 'Lyrics' : 'Add lyrics'}
                    </button>
                  ) : null}
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
                {onLyricsChange && editorOpen ? (
                  <div
                    id={`drop-track-lyrics-${index}`}
                    className="drop-track-lyrics-editor"
                  >
                    <label className="sr-only" htmlFor={`drop-track-lyrics-input-${index}`}>
                      Lyrics for {title}
                    </label>
                    <textarea
                      id={`drop-track-lyrics-input-${index}`}
                      className={`${osFieldSoftClassName} drop-track-lyrics-input}`}
                      rows={5}
                      maxLength={DROP_LYRICS_MAX_CHARS}
                      disabled={disabled}
                      placeholder="Optional lyrics for this track…"
                      value={draft}
                      onChange={(event) =>
                        onLyricsChange(index, event.target.value)
                      }
                    />
                    <p className="drop-track-lyrics-meta">
                      {draft.length.toLocaleString()} /{' '}
                      {DROP_LYRICS_MAX_CHARS.toLocaleString()}
                    </p>
                  </div>
                ) : null}
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
      <audio
        ref={audioRef}
        className="drop-track-preview-audio"
        preload="auto"
        playsInline
        onEnded={() => setPlayingKey(null)}
      />
    </>
  );
}
