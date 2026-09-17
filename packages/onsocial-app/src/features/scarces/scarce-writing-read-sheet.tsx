'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ChevronRightIcon,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
} from '@onsocial/ui';
import {
  OsSlideOverScreen,
  useOsSlideOverClose,
} from '@/components/app/os-slide-over-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import {
  paintWritingProgress,
  type ScarceReadableMedia,
  type WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

const CHROME_QUIET_MS = 900;

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

function WritingReadClose() {
  const requestClose = useOsSlideOverClose();
  return (
    <OsIconAction
      className="scarce-writing-read-close"
      ariaLabel="Back from reader"
      onClick={() => requestClose?.()}
    >
      <ChevronRightIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}

/** Isolated so chrome-quiet re-renders do not wipe the compositor fill. */
const WritingReadProgress = memo(function WritingReadProgress({
  barRef,
  fillRef,
  onPointerDown,
}: {
  barRef: RefObject<HTMLDivElement | null>;
  fillRef: RefObject<HTMLSpanElement | null>;
  onPointerDown: () => void;
}) {
  return (
    <div
      ref={barRef}
      className="scarce-writing-read-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
      onPointerDown={onPointerDown}
    >
      <span ref={fillRef} className="scarce-writing-read-progress-fill" />
    </div>
  );
});

/**
 * Writing reader — the page is the window. Title lives on the jacket once.
 * Close sits opposite it. Progress is a hairline on the glass.
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
  textAlign = null,
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
  textAlign?: 'left' | 'center' | 'justify' | null;
  canRead: boolean;
  lockedHint: string;
  footer?: ReactNode;
}) {
  const { isConnected, connect, isLoading } = useAppWallet();
  const quietTimerRef = useRef<number | null>(null);
  const liveAtRef = useRef(0);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const pendingPaintRef = useRef<{ ratio: number; ease: boolean } | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const [chromeQuiet, setChromeQuiet] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChromeQuiet(false);
    }
  }

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const applyPaint = useCallback((ratio: number, ease: boolean) => {
    paintWritingProgress({
      fill: fillRef.current,
      bar: barRef.current,
      ratio,
      ease,
      reducedMotion: prefersReducedMotion(),
    });
  }, []);

  const onReadingProgress = useCallback(
    (ratio: number, opts?: { ease?: boolean }) => {
      const ease = Boolean(opts?.ease);
      if (ease) {
        pendingPaintRef.current = null;
        if (rafRef.current) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        applyPaint(ratio, true);
        return;
      }
      pendingPaintRef.current = { ratio, ease: false };
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        const pending = pendingPaintRef.current;
        pendingPaintRef.current = null;
        if (pending) applyPaint(pending.ratio, false);
      });
    },
    [applyPaint]
  );

  useLayoutEffect(() => {
    if (!open) return;
    applyPaint(0, false);
  }, [open, applyPaint]);

  useEffect(() => {
    if (!open) return;
    liveAtRef.current =
      typeof performance !== 'undefined' ? performance.now() + 600 : 0;
  }, [open]);

  useEffect(
    () => () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    },
    []
  );

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

  const onChromeTap = useCallback(() => {
    clearQuietTimer();
    setChromeQuiet((quiet) => !quiet);
  }, [clearQuietTimer]);

  const onReadingScroll = useCallback(
    (deltaY: number) => {
      if (
        typeof performance !== 'undefined' &&
        performance.now() < liveAtRef.current
      ) {
        return;
      }
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

  const name = title.trim() || 'Drop';
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const connectLocked = !canRead && !isConnected;
  const connectFooter = connectLocked ? (
    <OsSheetFooter>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={!isLoading}
          pending={isLoading}
          pendingLabel="Connecting…"
          disabled={isLoading}
          onClick={() => void connect()}
        >
          Connect
        </OsSheetAction>
      </OsSheetActions>
    </OsSheetFooter>
  ) : null;

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title={name}
      hideNav
      viewport
      elevateChrome={false}
      closeAriaLabel="Back from reader"
      zIndex={SCARCE_Z.listenShell}
      className={`scarce-read-slide${chromeQuiet ? ' is-reading-quiet' : ''}`}
      contentClassName="scarce-read-slide-body"
      footer={connectFooter}
    >
      <div
        className={`scarce-writing-read${
          chromeQuiet ? ' is-chrome-quiet' : ''
        }${connectLocked ? ' is-connect-locked' : ''}`}
      >
        <WritingReadProgress
          barRef={barRef}
          fillRef={fillRef}
          onPointerDown={wakeChrome}
        />
        <div className="scarce-writing-read-hero">
          <div className="scarce-writing-read-mast">
            {inlineSvg && !rasterCover ? (
              <div className="scarce-writing-read-art">
                <div
                  className="scarce-writing-read-cover scarce-writing-read-cover--svg"
                  dangerouslySetInnerHTML={{ __html: inlineSvg }}
                />
              </div>
            ) : rasterCover ? (
              <div className="scarce-writing-read-art">
                <img
                  src={rasterCover}
                  alt=""
                  className="scarce-writing-read-cover"
                />
              </div>
            ) : null}
            <div className="scarce-writing-read-copy">
              <p className="scarce-writing-read-title">{name}</p>
            </div>
          </div>
          <WritingReadClose />
        </div>

        <div className="scarce-writing-read-body">
          {hasWriting ? (
            <CollectionWritingReader
              collectionId={collectionId}
              accountId={accountId}
              readables={readables}
              bookPdf={bookPdf}
              writingFormat={writingFormat}
              textAlign={textAlign}
              canRead={canRead}
              lockedHint={lockedHint}
              immersive
              onProgress={onReadingProgress}
              onScrollDelta={onReadingScroll}
              onChromeTap={onChromeTap}
            />
          ) : (
            <p className="scarce-feed-medium-empty">
              Writing unavailable for this Drop.
            </p>
          )}
        </div>

        {!connectLocked && footer ? (
          <div className="scarce-writing-read-footer">{footer}</div>
        ) : null}
      </div>
    </OsSlideOverScreen>
  );
}
