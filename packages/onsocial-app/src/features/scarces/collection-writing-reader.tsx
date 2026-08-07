'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { MediaDownloadControl } from '@/components/ui/media-download-control';
import {
  isWritingPdfMime,
  type ScarceReadableMedia,
  writingLastChapterStorageKey,
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
}: {
  collectionId: string;
  accountId?: string | null;
  readables: ScarceReadableMedia[];
  bookPdf?: ScarceReadableMedia | null;
  writingFormat?: 'article' | 'book' | null;
  canRead: boolean;
  lockedHint: string;
}) {
  const isBook =
    writingFormat === 'book' ||
    (writingFormat == null && readables.length > 1);

  const storageKey =
    accountId && collectionId
      ? writingLastChapterStorageKey(collectionId, accountId)
      : null;

  const [chapterIndex, setChapterIndex] = useState(() => {
    if (!storageKey || typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(storageKey);
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  });
  const [listKey, setListKey] = useState(() => readablesKey(readables));
  const [fetchState, setFetchState] = useState<
    | { status: 'idle' }
    | { status: 'ok'; url: string; text: string }
    | { status: 'error'; url: string; message: string }
  >({ status: 'idle' });

  const nextKey = readablesKey(readables);
  if (nextKey !== listKey) {
    setListKey(nextKey);
    setChapterIndex(0);
    setFetchState({ status: 'idle' });
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
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, String(safeIndex));
    } catch {
      // ignore quota / private mode
    }
  }, [storageKey, safeIndex]);

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

  if (readables.length === 0) {
    if (!bookPdf) return null;
    return (
      <section className="collection-writing" aria-label="Reading">
        <div className="collection-writing-head">
          <p className="collection-section-label">Book PDF</p>
          {canRead ? (
            <div className="collection-writing-downloads">
              <MediaDownloadControl
                className="collection-writing-download-control"
                ariaLabel="Download book PDF"
                onDownload={(onProgress) =>
                  downloadIpfsMedia({
                    cid: bookPdf.cid,
                    url: bookPdf.url,
                    mime: bookPdf.mime,
                    title: bookPdf.title,
                    fallbackName: 'book',
                    onProgress,
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
    <section className="collection-writing" aria-label="Reading">
      <div className="collection-writing-head">
        <p className="collection-section-label">
          {isBook
            ? `${readables.length} chapters`
            : readables[0]?.title?.trim() ||
              (chapterIsPdf ? 'PDF' : 'Manuscript')}
        </p>
        {(canRead && chapter) || (canRead && bookPdf) ? (
          <div className="collection-writing-downloads">
            {canRead && chapter ? (
              <MediaDownloadControl
                className="collection-writing-download-control"
                ariaLabel={
                  chapter.title?.trim()
                    ? `Download ${chapter.title.trim()}`
                    : 'Download chapter'
                }
                onDownload={(onProgress) =>
                  downloadIpfsMedia({
                    cid: chapter.cid,
                    url: chapter.url,
                    mime: chapter.mime,
                    title: chapter.title,
                    fallbackName: `chapter-${safeIndex + 1}`,
                    onProgress,
                  })
                }
              />
            ) : null}
            {canRead && bookPdf ? (
              <MediaDownloadControl
                className="collection-writing-download-control"
                ariaLabel="Download book PDF"
                onDownload={(onProgress) =>
                  downloadIpfsMedia({
                    cid: bookPdf.cid,
                    url: bookPdf.url,
                    mime: bookPdf.mime,
                    title: bookPdf.title,
                    fallbackName: 'book',
                    onProgress,
                  })
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {!canRead ? (
        <p className="collection-writing-locked">{lockedHint}</p>
      ) : (
        <>
          {isBook ? (
            <ol className="collection-writing-toc">
              {readables.map((entry, index) => (
                <li key={`${entry.url}-${index}`}>
                  <button
                    type="button"
                    className={`collection-writing-toc-item${
                      index === safeIndex ? ' is-active' : ''
                    }`}
                    onClick={() => setChapterIndex(index)}
                  >
                    <span className="collection-writing-toc-index">
                      {index + 1}
                    </span>
                    <span className="collection-writing-toc-title">
                      {entry.title?.trim() || `Chapter ${index + 1}`}
                      {isWritingPdfMime(entry.mime, entry.title) ? (
                        <span className="collection-writing-toc-kind">
                          {' '}
                          PDF
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="collection-writing-body">
            {isBook && chapter ? (
              <h3 className="collection-writing-chapter-title">
                {chapter.title?.trim() || `Chapter ${safeIndex + 1}`}
              </h3>
            ) : null}
            {chapterIsPdf && chapterUrl ? (
              <iframe
                className="collection-writing-pdf"
                title={
                  chapter.title?.trim() ||
                  `PDF chapter ${safeIndex + 1}`
                }
                src={chapterUrl}
              />
            ) : null}
            {loading ? (
              <p className="collection-writing-status">Loading…</p>
            ) : null}
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
