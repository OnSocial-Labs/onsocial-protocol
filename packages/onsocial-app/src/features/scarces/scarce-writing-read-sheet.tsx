'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { SheetCloseButton, useScrollLock } from '@onsocial/ui';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const LIGHTBOX_EXIT_MS = 180;
const CHROME_QUIET_MS = 900;

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

/**
 * Full-screen writing reader — same dark lightbox chrome as listen,
 * with a compact portrait cover and a calm manuscript body.
 */
export function WritingReadSheet({
  open,
  onClose,
  title,
  cover = null,
  coverSvg = null,
  collectionId,
  accountId = null,
  readables,
  bookPdf = null,
  writingFormat = null,
  canRead,
  lockedHint,
  footer = null,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cover?: string | null;
  coverSvg?: string | null;
  collectionId: string;
  accountId?: string | null;
  readables: ScarceReadableMedia[];
  bookPdf?: ScarceReadableMedia | null;
  writingFormat?: WritingReleaseFormat | null;
  canRead: boolean;
  lockedHint: string;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const quietTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [chromeQuiet, setChromeQuiet] = useState(false);
  const mounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setEntered(false);
      setScrollRatio(0);
      setChromeQuiet(false);
    }
  }

  const lightboxOpen = open && !closing;
  const viewport = useVisualViewportSheetMetrics(open || closing);
  useScrollLock(lightboxOpen);

  const lightboxStyle = useMemo((): CSSProperties | undefined => {
    if (typeof window === 'undefined') return undefined;
    const vv = window.visualViewport;
    if (!viewport.isMobile || !vv || viewport.height <= 0) return undefined;
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: vv.height,
      ['--scarce-lightbox-vh' as string]: `${viewport.height}px`,
    };
  }, [viewport.height, viewport.isMobile]);

  const clearQuietTimer = useCallback(() => {
    if (quietTimerRef.current != null) {
      window.clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
  }, []);

  const wakeChrome = useCallback(() => {
    clearQuietTimer();
    setChromeQuiet(false);
  }, [clearQuietTimer]);

  const requestClose = useCallback(() => {
    setClosing(true);
    setEntered(false);
  }, []);

  const onReadingProgress = useCallback((ratio: number) => {
    setScrollRatio(ratio);
  }, []);

  const onReadingScroll = useCallback(
    (deltaY: number) => {
      if (deltaY > 2) {
        clearQuietTimer();
        setChromeQuiet(true);
        return;
      }
      if (deltaY < -2) {
        wakeChrome();
        quietTimerRef.current = window.setTimeout(() => {
          setChromeQuiet(true);
        }, CHROME_QUIET_MS);
      }
    },
    [clearQuietTimer, wakeChrome]
  );

  useEffect(() => () => clearQuietTimer(), [clearQuietTimer]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, LIGHTBOX_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const id = window.requestAnimationFrame(() => {
      setEntered(true);
      closeRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, requestClose]);

  const name = title.trim() || 'Drop';
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const progressPct = Math.round(Math.min(1, Math.max(0, scrollRatio)) * 100);

  if (!mounted || (!open && !closing)) return null;

  return createPortal(
    <div
      className={`scarce-card-lightbox scarce-clip-listen-lightbox scarce-writing-read-lightbox${
        entered && !closing ? ' is-open' : ''
      }${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={lightboxStyle}
    >
      <div
        className={`scarce-writing-read${chromeQuiet ? ' is-chrome-quiet' : ''}`}
        onPointerDownCapture={wakeChrome}
      >
        <div
          className="scarce-writing-read-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="Reading progress"
        >
          <span
            className="scarce-writing-read-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="scarce-writing-read-top">
          <SheetCloseButton
            ref={closeRef}
            onClick={requestClose}
            ariaLabel="Close reader"
            className="scarce-writing-read-close"
          />
        </div>

        <div className="scarce-writing-read-hero">
          <div className="scarce-writing-read-art">
            {inlineSvg && !rasterCover ? (
              <div
                className="scarce-writing-read-cover scarce-writing-read-cover--svg"
                dangerouslySetInnerHTML={{ __html: inlineSvg }}
              />
            ) : rasterCover ? (
              <img
                src={rasterCover}
                alt=""
                className="scarce-writing-read-cover"
              />
            ) : (
              <div
                className="scarce-writing-read-cover scarce-writing-read-cover--empty"
                aria-hidden
              />
            )}
          </div>
          <div className="scarce-writing-read-copy">
            <p className="scarce-writing-read-eyebrow">Read</p>
            <p id={titleId} className="scarce-writing-read-title">
              {name}
            </p>
          </div>
        </div>

        <div className="scarce-writing-read-body">
          {hasWriting ? (
            <CollectionWritingReader
              collectionId={collectionId}
              accountId={accountId}
              readables={readables}
              bookPdf={bookPdf}
              writingFormat={writingFormat}
              canRead={canRead}
              lockedHint={lockedHint}
              immersive
              onProgress={onReadingProgress}
              onScrollDelta={onReadingScroll}
            />
          ) : (
            <p className="scarce-feed-medium-empty">
              Writing unavailable for this Drop.
            </p>
          )}
        </div>

        {footer ? (
          <div className="scarce-writing-read-footer">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
