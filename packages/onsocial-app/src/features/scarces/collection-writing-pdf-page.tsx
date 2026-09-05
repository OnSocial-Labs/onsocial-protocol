'use client';

import { useEffect, useRef, useState } from 'react';
import { CollectionWritingBodySkeleton } from '@/features/scarces/collection-page-skeleton';
import {
  writingPdfPageProgress,
  writingSwipeDirection,
} from '@/features/scarces/drop-writing';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfjsLib = typeof import('pdfjs-dist');

/** Copied from pdfjs-dist by next.config.mjs — Turbopack cannot `?url` the worker. */
const PDF_WORKER_SRC = '/pdfjs/pdf.worker.min.mjs';

let pdfjsLoader: Promise<PdfjsLib> | null = null;

function loadPdfjs(): Promise<PdfjsLib> {
  if (pdfjsLoader) return pdfjsLoader;
  pdfjsLoader = import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    return pdfjs;
  });
  return pdfjsLoader;
}

/**
 * One PDF as pages — paper, page index, swipe.
 * Not an iframe.
 */
export function CollectionWritingPdfPage({
  url,
  title,
  initialRatio = 0,
  onProgress,
  onEdgeSwipe,
}: {
  url: string;
  title: string;
  /** Restored 0–1 progress inside this PDF. */
  initialRatio?: number;
  onProgress?: (ratio: number) => void;
  /** Last/first page swipe — parent may turn the chapter. */
  onEdgeSwipe?: (direction: 'next' | 'prev') => void;
}) {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderGen = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setPageCount(0);
    const gen = ++renderGen.current;

    void loadPdfjs()
      .then((pdfjs) =>
        pdfjs.getDocument({ url, withCredentials: false }).promise
      )
      .then((doc) => {
        if (cancelled || gen !== renderGen.current) {
          void doc.destroy();
          return;
        }
        docRef.current?.destroy();
        docRef.current = doc;
        const count = doc.numPages;
        const start = Math.min(
          count - 1,
          Math.max(0, Math.round(initialRatio * Math.max(0, count - 1)))
        );
        setPageCount(count);
        setPageIndex(start);
        setStatus('ok');
      })
      .catch((cause) => {
        if (cancelled || gen !== renderGen.current) return;
        setStatus('error');
        setError(
          cause instanceof Error ? cause.message : 'Could not open this PDF.'
        );
      });

    return () => {
      cancelled = true;
      const doc = docRef.current;
      docRef.current = null;
      if (doc) void doc.destroy();
    };
    // Resume from the ratio captured when this URL mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialRatio is a mount resume
  }, [url]);

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const paper = paperRef.current;
    if (!doc || !canvas || !paper || status !== 'ok' || pageCount <= 0) {
      return;
    }
    let cancelled = false;
    const gen = ++renderGen.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    void doc.getPage(pageIndex + 1).then(async (page) => {
      if (cancelled || gen !== renderGen.current) return;
      const base = page.getViewport({ scale: 1 });
      const width = Math.max(1, paper.clientWidth);
      const scale = width / base.width;
      const viewport = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({
        canvasContext: ctx,
        viewport,
      });
      try {
        await task.promise;
      } catch {
        // superseded render
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pageIndex, pageCount, status, url]);

  useEffect(() => {
    if (status !== 'ok' || pageCount <= 0) return;
    onProgress?.(
      writingPdfPageProgress({
        pageIndex,
        pageCount,
        pageRatio: 1,
      })
    );
  }, [onProgress, pageCount, pageIndex, status]);

  const go = (nextIndex: number) => {
    if (pageCount <= 0) return;
    if (nextIndex < 0) {
      onEdgeSwipe?.('prev');
      return;
    }
    if (nextIndex >= pageCount) {
      onEdgeSwipe?.('next');
      return;
    }
    setPageIndex(nextIndex);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start) return;
    const direction = writingSwipeDirection(start, {
      x: event.clientX,
      y: event.clientY,
    });
    if (direction === 'next') go(pageIndex + 1);
    if (direction === 'prev') go(pageIndex - 1);
  };

  return (
    <div className="collection-writing-pdf-page">
      <div
        ref={paperRef}
        className="collection-writing-pdf-paper"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointerRef.current = null;
        }}
      >
        {status === 'loading' ? <CollectionWritingBodySkeleton /> : null}
        {status === 'error' ? (
          <p className="collection-writing-status is-error">
            {error ?? 'Could not open this PDF.'}
          </p>
        ) : null}
        {status === 'ok' ? (
          <canvas
            ref={canvasRef}
            className="collection-writing-pdf-canvas"
            aria-label={title}
          />
        ) : null}
      </div>
      {status === 'ok' && pageCount > 0 ? (
        <div
          className="collection-writing-pdf-nav"
          role="group"
          aria-label="Pages"
        >
          <button
            type="button"
            className="os-surface-chip"
            disabled={pageIndex <= 0 && !onEdgeSwipe}
            onClick={() => go(pageIndex - 1)}
          >
            Previous
          </button>
          <p className="collection-writing-pdf-count">
            {pageIndex + 1} / {pageCount}
          </p>
          <button
            type="button"
            className="os-surface-chip"
            disabled={pageIndex >= pageCount - 1 && !onEdgeSwipe}
            onClick={() => go(pageIndex + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
