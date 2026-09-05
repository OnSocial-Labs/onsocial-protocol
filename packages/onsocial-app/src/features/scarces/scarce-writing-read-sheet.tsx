'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MultiplyIcon, OsIconAction } from '@onsocial/ui';
import {
  OsSlideOverScreen,
  useOsSlideOverClose,
} from '@/components/app/os-slide-over-screen';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
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
      <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}

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
  const quietTimerRef = useRef<number | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [chromeQuiet, setChromeQuiet] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setScrollRatio(0);
      setChromeQuiet(false);
    }
  }

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

  const name = title.trim() || 'Drop';
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const progressPct = Math.round(Math.min(1, Math.max(0, scrollRatio)) * 100);

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title={name}
      hideNav
      viewport
      closeAriaLabel="Back from reader"
      zIndex={SCARCE_Z.listenShell}
      className={`scarce-read-slide${chromeQuiet ? ' is-reading-quiet' : ''}`}
      contentClassName="scarce-read-slide-body"
    >
      <div
        className={`scarce-writing-read${chromeQuiet ? ' is-chrome-quiet' : ''}`}
      >
        <div
          className="scarce-writing-read-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="Reading progress"
          onPointerDown={wakeChrome}
        >
          <span
            className="scarce-writing-read-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="scarce-writing-read-hero">
          <div className="scarce-writing-read-mast">
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

        {footer ? (
          <div className="scarce-writing-read-footer">{footer}</div>
        ) : null}
      </div>
    </OsSlideOverScreen>
  );
}
