'use client';

import { useEffect, useRef, useState } from 'react';
import { CollectionWritingBodySkeleton } from '@/features/scarces/collection-page-skeleton';
import {
  writingPdfVisiblePage,
  writingPinchScale,
} from '@/features/scarces/drop-writing';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

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

function PdfLeaf({
  doc,
  pageNumber,
  width,
  shouldRender,
  title,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  shouldRender: boolean;
  title: string;
}) {
  const leafRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [leafHeight, setLeafHeight] = useState(() =>
    Math.round(width * (792 / 612))
  );

  useEffect(() => {
    if (!shouldRender || width <= 0) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    const textEl = textRef.current;
    if (!canvas || !textEl) return;

    void doc.getPage(pageNumber).then(async (page: PDFPageProxy) => {
      if (cancelled) return;
      const pdfjs = await loadPdfjs();
      if (cancelled) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      setLeafHeight(Math.floor(viewport.height));
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      renderTaskRef.current?.cancel();
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        intent: 'display',
        annotationMode: 0,
      });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      textEl.replaceChildren();
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textEl,
        viewport,
      });
      textTaskRef.current = layer;
      try {
        await layer.render();
      } catch {
        // superseded
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      textTaskRef.current?.cancel();
      textTaskRef.current = null;
    };
  }, [doc, pageNumber, shouldRender, width]);

  return (
    <div
      ref={leafRef}
      className="collection-writing-pdf-leaf"
      style={{ minHeight: leafHeight }}
      data-page={pageNumber}
    >
      {shouldRender ? (
        <>
          <canvas
            ref={canvasRef}
            className="collection-writing-pdf-canvas"
            aria-label={`${title} page ${pageNumber}`}
          />
          <div
            ref={textRef}
            className="collection-writing-pdf-text textLayer"
          />
        </>
      ) : (
        <div className="collection-writing-pdf-leaf-slot" aria-hidden />
      )}
    </div>
  );
}

/**
 * One PDF as a stacked folio — paper you scroll, select, and pinch.
 * Not an iframe. Not a one-page flip.
 */
export function CollectionWritingPdfPage({
  url,
  title,
  initialRatio = 0,
  onVisiblePage,
}: {
  url: string;
  title: string;
  initialRatio?: number;
  onProgress?: (ratio: number) => void;
  onEdgeSwipe?: (direction: 'next' | 'prev') => void;
  onVisiblePage?: (pageIndex: number, pageCount: number) => void;
}) {
  const folioRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [near, setNear] = useState<Record<number, true>>({});
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState(url);
  if (url !== loadedUrl) {
    setLoadedUrl(url);
    setDoc(null);
    setPageCount(0);
    setNear({});
    setZoom(1);
    setStatus('loading');
    setError(null);
    setVisibleIndex(0);
  }

  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;

    void loadPdfjs()
      .then((pdfjs) =>
        pdfjs.getDocument({ url, withCredentials: false }).promise
      )
      .then((nextDoc) => {
        if (cancelled) {
          void nextDoc.destroy();
          return;
        }
        opened = nextDoc;
        setDoc(nextDoc);
        setPageCount(nextDoc.numPages);
        setStatus('ok');
      })
      .catch((cause) => {
        if (cancelled) return;
        setStatus('error');
        setError(
          cause instanceof Error ? cause.message : 'Could not open this PDF.'
        );
      });

    return () => {
      cancelled = true;
      if (opened) void opened.destroy();
    };
  }, [url]);

  useEffect(() => {
    const folio = folioRef.current;
    if (!folio) return;
    const measure = () => {
      setPageWidth(Math.max(1, Math.floor(folio.clientWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(folio);
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    const folio = folioRef.current;
    if (!folio || status !== 'ok' || pageCount <= 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNear((current) => {
          const next = { ...current };
          for (const entry of entries) {
            const raw = (entry.target as HTMLElement).dataset.page;
            const page = Number.parseInt(raw ?? '', 10);
            if (!Number.isSafeInteger(page) || page < 1) continue;
            if (entry.isIntersecting) next[page] = true;
          }
          return next;
        });
      },
      { root: folio.closest('.collection-writing-body'), rootMargin: '120% 0px' }
    );
    folio.querySelectorAll<HTMLElement>('[data-page]').forEach((node) => {
      observer.observe(node);
    });
    return () => observer.disconnect();
  }, [pageCount, status, pageWidth]);

  useEffect(() => {
    if (status !== 'ok' || pageCount <= 0) return;
    onVisiblePage?.(visibleIndex, pageCount);
  }, [onVisiblePage, pageCount, status, visibleIndex]);

  useEffect(() => {
    const body = folioRef.current?.closest('.collection-writing-body');
    if (!body || status !== 'ok') return;
    const onScroll = () => {
      const leaves = [
        ...body.querySelectorAll<HTMLElement>('.collection-writing-pdf-leaf'),
      ];
      if (leaves.length === 0) return;
      const origin = body.getBoundingClientRect().top;
      const tops = leaves.map(
        (leaf) =>
          leaf.getBoundingClientRect().top - origin + body.scrollTop
      );
      setVisibleIndex(
        writingPdfVisiblePage({
          scrollTop: body.scrollTop,
          pageTops: tops,
        })
      );
    };
    onScroll();
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, [pageCount, status]);

  useEffect(() => {
    if (status !== 'ok' || pageCount <= 0 || initialRatio <= 0) return;
    const body = folioRef.current?.closest('.collection-writing-body');
    if (!body) return;
    let tries = 0;
    const apply = () => {
      const max = body.scrollHeight - body.clientHeight;
      if (max <= 0) return false;
      body.scrollTop = initialRatio * max;
      return true;
    };
    if (apply()) return;
    const timer = window.setInterval(() => {
      tries += 1;
      if (apply() || tries > 20) window.clearInterval(timer);
    }, 80);
    return () => window.clearInterval(timer);
  }, [initialRatio, pageCount, status]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointersRef.current.size >= 2) {
      event.stopPropagation();
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        scale: zoom,
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointersRef.current.size < 2 || !pinchRef.current) return;
    event.stopPropagation();
    const [a, b] = [...pointersRef.current.values()];
    setZoom(
      writingPinchScale({
        startDistance: pinchRef.current.distance,
        currentDistance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        startScale: pinchRef.current.scale,
      })
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  return (
    <div className="collection-writing-pdf-page">
      <div
        ref={folioRef}
        className="collection-writing-pdf-folio"
        style={{ zoom }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {status === 'loading' ? <CollectionWritingBodySkeleton /> : null}
        {status === 'error' ? (
          <p className="collection-writing-status is-error">
            {error ?? 'Could not open this PDF.'}
          </p>
        ) : null}
        {status === 'ok' && doc
          ? Array.from({ length: pageCount }, (_, index) => (
              <PdfLeaf
                key={`${url}-${index + 1}`}
                doc={doc}
                pageNumber={index + 1}
                width={pageWidth}
                shouldRender={Boolean(near[index + 1]) || index === 0}
                title={title}
              />
            ))
          : null}
      </div>
      {status === 'ok' && pageCount > 0 ? (
        <p className="collection-writing-pdf-count" aria-live="polite">
          {visibleIndex + 1} / {pageCount}
        </p>
      ) : null}
    </div>
  );
}
