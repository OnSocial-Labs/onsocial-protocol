'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { MediaDownloadControl } from '@/components/ui/media-download-control';
import { CollectionWritingBodySkeleton } from '@/features/scarces/collection-page-skeleton';
import {
  isWritingPdfMime,
  readWritingChapterIndex,
  readWritingScrollRatio,
  writeWritingChapterIndex,
  writeWritingScrollRatio,
  type ScarceReadableMedia,
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
  writingFormat?: 'article' | 'book' | null;
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
  const [chapterIndex, setChapterIndex] = useState(() =>
    readWritingChapterIndex(collectionId, accountId)
  );
  const [listKey, setListKey] = useState(() => readablesKey(readables));
  const [tocOpen, setTocOpen] = useState(false);
  const [fetchState, setFetchState] = useState<
    | { status: 'idle' }
    | { status: 'ok'; url: string; text: string }
    | { status: 'error'; url: string; message: string }
  >({ status: 'idle' });

  const nextKey = readablesKey(readables);
  if (nextKey !== listKey) {
    setListKey(nextKey);
    setChapterIndex(readWritingChapterIndex(collectionId, accountId));
    setFetchState({ status: 'idle' });
    setTocOpen(false);
  }

  const safeIndex = Math.min(
    chapterIndex,
    Math.max(0, readables.length - 1)
  );
  if (chapterIndex !== safeIndex && readables.length > 0) {
    setChapterIndex(safeIndex);
  }
  const chapter = readables[safeIndex] ?? null;
  const chapterIsPdf = chapter
    ? isWritingPdfMime(chapter.mime, chapter.title)
    : false;
  const chapterUrl = canRead ? (chapter?.url ?? null) : null;
  const chapterLabel =
    chapter?.title?.trim() ||
    (readables.length > 0 ? `Chapter ${safeIndex + 1}` : 'Manuscript');
  const body =
    !chapterIsPdf &&
    chapterUrl &&
    fetchState.status === 'ok' &&
    fetchState.url === chapterUrl
      ? fetchState.text
      : null;
  const loadError =
    !chapterIsPdf &&
    chapterUrl &&
    fetchState.status === 'error' &&
    fetchState.url === chapterUrl
      ? fetchState.message
      : null;
  const loading =
    Boolean(chapterUrl) &&
    !chapterIsPdf &&
    body == null &&
    loadError == null;

  useEffect(() => {
    writeWritingChapterIndex(collectionId, accountId, safeIndex);
  }, [collectionId, accountId, safeIndex]);

  useEffect(() => {
    if (!chapterUrl || chapterIsPdf) return;
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
        onProgress?.(0);
        return;
      }
      el.scrollTop = ratio * max;
      lastScrollTopRef.current = el.scrollTop;
      onProgress?.(ratio);
    };
    apply();
    const frame = window.requestAnimationFrame(apply);
    return () => window.cancelAnimationFrame(frame);
  }, [body, collectionId, accountId, safeIndex, onProgress]);

  // Prefetch next Markdown chapter (book only).
  useEffect(() => {
    if (!canRead || !isBook) return;
    const next = readables[safeIndex + 1];
    if (!next?.url || isWritingPdfMime(next.mime, next.title)) return;
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
    onProgress?.(ratio);
    const delta = el.scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = el.scrollTop;
    if (delta !== 0) onScrollDelta?.(delta);
  };

  const selectChapter = (index: number) => {
    setChapterIndex(index);
    setTocOpen(false);
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
          >
            {isBook && chapter ? (
              <h3 className="collection-writing-chapter-title">
                {chapterLabel}
              </h3>
            ) : null}
            {chapterIsPdf && chapterUrl ? (
              <iframe
                className="collection-writing-pdf"
                title={
                  chapter.title?.trim() || `PDF chapter ${safeIndex + 1}`
                }
                src={chapterUrl}
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
                onClick={() => setChapterIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="os-surface-chip"
                disabled={safeIndex >= readables.length - 1}
                onClick={() =>
                  setChapterIndex((i) =>
                    Math.min(readables.length - 1, i + 1)
                  )
                }
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
