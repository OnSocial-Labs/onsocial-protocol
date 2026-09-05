'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { MediaDownloadControl } from '@/components/ui/media-download-control';
import { CollectionWritingBodySkeleton } from '@/features/scarces/collection-page-skeleton';
import { CollectionWritingPdfPage } from '@/features/scarces/collection-writing-pdf-page';
import {
  isWritingPdfMime,
  readWritingChapterIndex,
  readWritingScrollRatio,
  writingObjectProgress,
  writingSwipeDirection,
  writeWritingChapterIndex,
  writeWritingScrollRatio,
  type ScarceReadableMedia,
  type WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { downloadIpfsMedia } from '@/lib/media-download';

function readablesKey(readables: ScarceReadableMedia[]): string {
  return readables.map((entry) => entry.url).join('\0');
}

export function CollectionWritingReader({
  collectionId,
  accountId,
  readables,
  bookPdf,
  writingFormat,
  canRead,
  lockedHint,
  /** Immersive read sheet — denser chrome, body scrolls inside the shell. */
  immersive = false,
  onProgress,
  onScrollDelta,
}: {
  collectionId: string;
  accountId?: string | null;
  readables: ScarceReadableMedia[];
  bookPdf?: ScarceReadableMedia | null;
  writingFormat?: WritingReleaseFormat | null;
  canRead: boolean;
  lockedHint: string;
  immersive?: boolean;
  /** 0–1 scroll progress for the active chapter body. */
  onProgress?: (ratio: number) => void;
  /** Signed scroll delta (px) for chrome fade. */
  onScrollDelta?: (deltaY: number) => void;
}) {
  const isBook =
    writingFormat === 'book' ||
    (writingFormat == null && readables.length > 1);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const chapterRatioRef = useRef(0);
  const [chapterIndex, setChapterIndex] = useState(() =>
    readWritingChapterIndex(collectionId, accountId)
  );
  const [chapterRatio, setChapterRatio] = useState(0);
  const [listKey, setListKey] = useState(() => readablesKey(readables));
  const [tocOpen, setTocOpen] = useState(false);
  const [fetchState, setFetchState] = useState<
    | { status: 'idle' }
    | { status: 'ok'; url: string; text: string }
    | { status: 'error'; url: string; message: string }
  >({ status: 'idle' });

  const nextKey = readablesKey(readables);
  const safeIndex = Math.min(
    chapterIndex,
    Math.max(0, readables.length - 1)
  );

  useEffect(() => {
    if (nextKey === listKey) {
      if (chapterIndex !== safeIndex && readables.length > 0) {
        setChapterIndex(safeIndex);
      }
      return;
    }
    setListKey(nextKey);
    setChapterIndex(readWritingChapterIndex(collectionId, accountId));
    chapterRatioRef.current = 0;
    setChapterRatio(0);
    setFetchState({ status: 'idle' });
    setTocOpen(false);
  }, [
    accountId,
    chapterIndex,
    collectionId,
    listKey,
    nextKey,
    readables.length,
    safeIndex,
  ]);
  const chapter = readables[safeIndex] ?? null;
  const chapterIsPdf = chapter
    ? isWritingPdfMime(chapter.mime, chapter.title)
    : false;
  const inlineText = canRead && chapter?.text != null ? chapter.text : null;
  const chapterUrl =
    canRead && inlineText == null ? (chapter?.url ?? null) : null;
  const chapterLabel =
    chapter?.title?.trim() ||
    (readables.length > 0 ? `Chapter ${safeIndex + 1}` : 'Manuscript');
  const body =
    !chapterIsPdf && inlineText != null
      ? inlineText
      : !chapterIsPdf &&
          chapterUrl &&
          fetchState.status === 'ok' &&
          fetchState.url === chapterUrl
        ? fetchState.text
        : null;
  const loadError =
    !chapterIsPdf &&
    inlineText == null &&
    chapterUrl &&
    fetchState.status === 'error' &&
    fetchState.url === chapterUrl
      ? fetchState.message
      : null;
  const loading =
    Boolean(chapterUrl) &&
    !chapterIsPdf &&
    inlineText == null &&
    body == null &&
    loadError == null;

  useEffect(() => {
    writeWritingChapterIndex(collectionId, accountId, safeIndex);
  }, [collectionId, accountId, safeIndex]);

  useEffect(() => {
    onProgress?.(
      writingObjectProgress({
        chapterIndex: safeIndex,
        chapterCount: readables.length,
        chapterRatio,
      })
    );
  }, [chapterRatio, onProgress, readables.length, safeIndex]);

  const goChapter = (nextIndex: number) => {
    if (readables.length <= 0) return;
    const next = Math.min(readables.length - 1, Math.max(0, nextIndex));
    if (next === safeIndex) return;
    setChapterIndex(next);
    chapterRatioRef.current = 0;
    setChapterRatio(0);
    setTocOpen(false);
  };

  useEffect(() => {
    if (!chapterUrl || chapterIsPdf || chapterUrl.startsWith('post:')) return;
    let cancelled = false;
    const url = chapterUrl;
    void fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load this chapter.');
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        setFetchState({ status: 'ok', url, text });
      })
      .catch((cause) => {
        if (cancelled) return;
        setFetchState({
          status: 'error',
          url,
          message:
            cause instanceof Error
              ? cause.message
              : 'Could not load this chapter.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [chapterUrl, chapterIsPdf]);

  // Restore scroll after markdown paints.
  useEffect(() => {
    if (!body || !bodyRef.current) return;
    const ratio = readWritingScrollRatio(collectionId, accountId, safeIndex);
    const el = bodyRef.current;
    const apply = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) {
        lastScrollTopRef.current = 0;
        // Fully visible chapter — count it finished so the book bar stays honest.
        chapterRatioRef.current = 1;
        setChapterRatio(1);
        return;
      }
      el.scrollTop = ratio * max;
      lastScrollTopRef.current = el.scrollTop;
      chapterRatioRef.current = ratio;
      setChapterRatio(ratio);
    };
    apply();
    const frame = window.requestAnimationFrame(apply);
    return () => window.cancelAnimationFrame(frame);
  }, [body, collectionId, accountId, safeIndex]);

  // Prefetch next Markdown chapter (book only).
  useEffect(() => {
    if (!canRead || !isBook) return;
    const next = readables[safeIndex + 1];
    if (!next?.url || isWritingPdfMime(next.mime, next.title)) return;
    if (!/^https?:/i.test(next.url) && !next.url.startsWith('/')) return;
    const controller = new AbortController();
    void fetch(next.url, { signal: controller.signal }).catch(() => {
      // best-effort
    });
    return () => controller.abort();
  }, [canRead, isBook, readables, safeIndex]);

  const onBodyScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const ratio = max > 0 ? el.scrollTop / max : 0;
    writeWritingScrollRatio(collectionId, accountId, safeIndex, ratio);
    setChapterRatio(ratio);
    const delta = el.scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = el.scrollTop;
    if (delta !== 0) onScrollDelta?.(delta);
  };

  const selectChapter = (index: number) => {
    goChapter(index);
  };

  const onBodyPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isBook || chapterIsPdf) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const onBodyPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isBook || chapterIsPdf) {
      pointerRef.current = null;
      return;
    }
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start) return;
    const direction = writingSwipeDirection(start, {
      x: event.clientX,
      y: event.clientY,
    });
    if (direction === 'next') goChapter(safeIndex + 1);
    if (direction === 'prev') goChapter(safeIndex - 1);
  };

  const downloads =
    (canRead && chapter) || (canRead && bookPdf) ? (
      <div className="collection-writing-downloads">
        {canRead && chapter ? (
          <MediaDownloadControl
            className="collection-writing-download-control"
            ariaLabel={
              chapter.title?.trim()
                ? `Download ${chapter.title.trim()}`
                : 'Download chapter'
            }
            onDownload={(onProgressDownload) =>
              downloadIpfsMedia({
                cid: chapter.cid,
                url: chapter.url,
                mime: chapter.mime,
                title: chapter.title,
                fallbackName: `chapter-${safeIndex + 1}`,
                onProgress: onProgressDownload,
              })
            }
          />
        ) : null}
        {canRead && bookPdf ? (
          <MediaDownloadControl
            className="collection-writing-download-control"
            ariaLabel="Download book PDF"
            onDownload={(onProgressDownload) =>
              downloadIpfsMedia({
                cid: bookPdf.cid,
                url: bookPdf.url,
                mime: bookPdf.mime,
                title: bookPdf.title,
                fallbackName: 'book',
                onProgress: onProgressDownload,
              })
            }
          />
        ) : null}
      </div>
    ) : null;

  const tocList = isBook ? (
    <ol className="collection-writing-toc">
      {readables.map((entry, index) => (
        <li key={`${entry.url}-${index}`}>
          <button
            type="button"
            className={`collection-writing-toc-item${
              index === safeIndex ? ' is-active' : ''
            }`}
            onClick={() => selectChapter(index)}
          >
            <span className="collection-writing-toc-index">{index + 1}</span>
            <span className="collection-writing-toc-title">
              {entry.title?.trim() || `Chapter ${index + 1}`}
              {isWritingPdfMime(entry.mime, entry.title) ? (
                <span className="collection-writing-toc-kind"> PDF</span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ol>
  ) : null;

  if (readables.length === 0) {
    if (!bookPdf) return null;
    return (
      <section
        className={`collection-writing${immersive ? ' is-immersive' : ''}`}
        aria-label="Reading"
      >
        <div className="collection-writing-head">
          <p className="collection-section-label">Book PDF</p>
          {canRead ? (
            <div className="collection-writing-downloads">
              <MediaDownloadControl
                className="collection-writing-download-control"
                ariaLabel="Download book PDF"
                onDownload={(onProgressDownload) =>
                  downloadIpfsMedia({
                    cid: bookPdf.cid,
                    url: bookPdf.url,
                    mime: bookPdf.mime,
                    title: bookPdf.title,
                    fallbackName: 'book',
                    onProgress: onProgressDownload,
                  })
                }
              />
            </div>
          ) : null}
        </div>
        {!canRead ? (
          <p className="collection-writing-locked">{lockedHint}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`collection-writing${immersive ? ' is-immersive' : ''}`}
      aria-label="Reading"
    >
      {immersive ? (
        <div className="collection-writing-tools">
          {isBook ? (
            <div className="collection-writing-toc-wrap">
              <button
                type="button"
                className={`collection-writing-chapter-chip${
                  tocOpen ? ' is-open' : ''
                }`}
                aria-expanded={tocOpen}
                onClick={() => setTocOpen((open) => !open)}
              >
                <span className="collection-writing-chapter-chip-meta">
                  {safeIndex + 1} / {readables.length}
                </span>
                <span className="collection-writing-chapter-chip-title">
                  {chapterLabel}
                </span>
              </button>
              {tocOpen ? tocList : null}
            </div>
          ) : (
            <p className="collection-writing-article-label">{chapterLabel}</p>
          )}
          {downloads}
        </div>
      ) : (
        <div className="collection-writing-head">
          <p className="collection-section-label">
            {isBook
              ? `${readables.length} chapters`
              : readables[0]?.title?.trim() ||
                (chapterIsPdf ? 'PDF' : 'Manuscript')}
          </p>
          {downloads}
        </div>
      )}

      {!canRead ? (
        <p className="collection-writing-locked">{lockedHint}</p>
      ) : (
        <>
          {!immersive && isBook ? tocList : null}

          <div
            ref={bodyRef}
            className="collection-writing-body"
            onScroll={onBodyScroll}
            onPointerDown={onBodyPointerDown}
            onPointerUp={onBodyPointerUp}
            onPointerCancel={() => {
              pointerRef.current = null;
            }}
          >
            {isBook && chapter ? (
              <h3 className="collection-writing-chapter-title">
                {chapterLabel}
              </h3>
            ) : null}
            {chapterIsPdf && chapterUrl ? (
              <CollectionWritingPdfPage
                url={chapterUrl}
                title={
                  chapter.title?.trim() || `PDF chapter ${safeIndex + 1}`
                }
                initialRatio={readWritingScrollRatio(
                  collectionId,
                  accountId,
                  safeIndex
                )}
                onProgress={(ratio) => {
                  writeWritingScrollRatio(
                    collectionId,
                    accountId,
                    safeIndex,
                    ratio
                  );
                  const prev = chapterRatioRef.current;
                  chapterRatioRef.current = ratio;
                  setChapterRatio(ratio);
                  if (ratio > prev + 0.002) onScrollDelta?.(8);
                  else if (ratio < prev - 0.002) onScrollDelta?.(-8);
                }}
                onEdgeSwipe={
                  isBook
                    ? (direction) =>
                        goChapter(
                          direction === 'next' ? safeIndex + 1 : safeIndex - 1
                        )
                    : undefined
                }
              />
            ) : null}
            {loading ? <CollectionWritingBodySkeleton /> : null}
            {loadError ? (
              <p className="collection-writing-status is-error">{loadError}</p>
            ) : null}
            {body != null ? (
              <div className="collection-writing-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                >
                  {body}
                </ReactMarkdown>
              </div>
            ) : null}
          </div>

          {isBook ? (
            <div
              className="collection-writing-nav"
              role="group"
              aria-label="Chapters"
            >
              <button
                type="button"
                className="os-surface-chip"
                disabled={safeIndex <= 0}
                onClick={() => goChapter(safeIndex - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="os-surface-chip"
                disabled={safeIndex >= readables.length - 1}
                onClick={() => goChapter(safeIndex + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
