'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
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
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import {
  collectionCurrentRowToView,
  hydrateWritingManifest,
} from '@/features/scarces/collections-data';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { osChromeFrostStyle } from '@/lib/os-chrome-frost';

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

/**
 * Writing reader — OS phone-card page scroll (body scroller, not a nested
 * text viewport). Jacket sticks at the top; post icons use the OS screen
 * footer so they sit above the summon dock and lift with reply/compose.
 * Scroll-down only tucks the jacket + dock.
 */
export function WritingReadSheet({
  open,
  onClose,
  title,
  cover = null,
  coverSvg = null,
  collectionId,
  accountId = null,
  readables: readablesProp,
  bookPdf: bookPdfProp = null,
  writingFormat: writingFormatProp = null,
  textAlign: textAlignProp = null,
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
  const seekProgressRef = useRef<((ratio: number) => void) | null>(null);
  const scrubbingRef = useRef(false);
  const chromeQuietAccumRef = useRef(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [chromeQuiet, setChromeQuiet] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [hydratedReadables, setHydratedReadables] = useState<
    ScarceReadableMedia[]
  >([]);
  const [hydratedBookPdf, setHydratedBookPdf] =
    useState<ScarceReadableMedia | null>(null);
  const [hydratedWritingFormat, setHydratedWritingFormat] =
    useState<WritingReleaseFormat | null>(null);
  const [hydratedTextAlign, setHydratedTextAlign] = useState<
    'left' | 'center' | 'justify' | null
  >(null);
  const [hydrateSettled, setHydrateSettled] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setScrollRatio(0);
      setCoverOpen(false);
      setScrubbing(false);
      scrubbingRef.current = false;
      setChromeQuiet(false);
      chromeQuietAccumRef.current = 0;
      setHydratedReadables([]);
      setHydratedBookPdf(null);
      setHydratedWritingFormat(null);
      setHydratedTextAlign(null);
      setHydrateSettled(false);
    } else {
      setCoverOpen(false);
    }
  }

  const readables =
    readablesProp.length > 0 ? readablesProp : hydratedReadables;
  const bookPdf = bookPdfProp ?? hydratedBookPdf;
  const writingFormat = writingFormatProp ?? hydratedWritingFormat;
  const textAlign = textAlignProp ?? hydratedTextAlign;

  useEffect(() => {
    if (!open) return;
    if (readablesProp.length > 0 || bookPdfProp) {
      setHydrateSettled(true);
      return;
    }
    const id = collectionId.trim();
    if (!id) {
      setHydrateSettled(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const rows = await createReadOnlyOnSocialClient()
          .query.scarces.collectionsCurrentByIds([id])
          .catch(() => []);
        if (cancelled) return;
        const view = rows[0] ? collectionCurrentRowToView(rows[0]) : null;
        if (!view) return;
        const hydrated = await hydrateWritingManifest(view);
        if (cancelled) return;
        if (hydrated.readables.length > 0) {
          setHydratedReadables(hydrated.readables);
        }
        if (hydrated.bookPdf) setHydratedBookPdf(hydrated.bookPdf);
        if (hydrated.writingFormat) {
          setHydratedWritingFormat(hydrated.writingFormat);
        }
        setHydratedTextAlign(hydrated.textAlign ?? null);
      } catch {
        /* settled empty below */
      } finally {
        if (!cancelled) setHydrateSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, collectionId, readablesProp.length, bookPdfProp?.cid]);

  const onReadingProgress = useCallback((ratio: number) => {
    if (scrubbingRef.current) return;
    setScrollRatio(ratio);
    if (ratio <= 0.015) {
      chromeQuietAccumRef.current = 0;
      setChromeQuiet(false);
    }
  }, []);

  const endScrub = useCallback(() => {
    scrubbingRef.current = false;
    setScrubbing(false);
  }, []);

  const beginScrub = useCallback(() => {
    scrubbingRef.current = true;
    setScrubbing(true);
  }, []);

  const seekReading = useCallback((ratio: number) => {
    const next = Math.min(1, Math.max(0, ratio));
    setScrollRatio(next);
    seekProgressRef.current?.(next);
  }, []);

  const onScrollDelta = useCallback((deltaY: number) => {
    if (scrubbingRef.current) return;
    const next = Math.max(
      -48,
      Math.min(48, chromeQuietAccumRef.current + deltaY)
    );
    chromeQuietAccumRef.current = next;
    if (next > 28) {
      setChromeQuiet(true);
      chromeQuietAccumRef.current = 0;
    } else if (next < -20) {
      setChromeQuiet(false);
      chromeQuietAccumRef.current = 0;
    }
  }, []);

  const onChromeTap = useCallback(() => {
    chromeQuietAccumRef.current = 0;
    setChromeQuiet((quiet) => !quiet);
  }, []);

  useRegisterImmersiveChromeQuiet(open && chromeQuiet);

  /* Reply / compose — wake jacket quiet so dock + icon strip stay paired. */
  const writePinned = useWriteDockPinned();
  useEffect(() => {
    if (!open || !writePinned) return;
    chromeQuietAccumRef.current = 0;
    setChromeQuiet(false);
  }, [open, writePinned]);

  const name = title.trim() || 'Drop';
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const progressPct = Math.round(Math.min(1, Math.max(0, scrollRatio)) * 100);
  const progressSteps = 1000;
  const progressValue = Math.round(
    Math.min(1, Math.max(0, scrollRatio)) * progressSteps
  );
  const connectLocked = !canRead && !isConnected;
  const showPostFooter = Boolean(footer) && !connectLocked;
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
  const screenFooter = connectFooter ?? (showPostFooter ? (
    <>
      <div
        className="scarce-writing-read-footer-glass"
        aria-hidden
        style={osChromeFrostStyle()}
      />
      <div className="scarce-writing-read-footer">{footer}</div>
    </>
  ) : null);

  const frostStyle = osChromeFrostStyle();

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title={name}
      hideNav
      elevateChrome={false}
      closeAriaLabel="Back from reader"
      zIndex={SCARCE_Z.listenShell}
      className={`scarce-read-slide${chromeQuiet ? ' is-chrome-quiet' : ''}`}
      contentClassName="scarce-read-slide-body"
      footer={screenFooter}
    >
      <div
        className={`scarce-writing-read${
          connectLocked ? ' is-connect-locked' : ''
        }${chromeQuiet ? ' is-chrome-quiet' : ''}`}
        style={
          {
            '--scarce-writing-p': String(
              Math.min(1, Math.max(0, scrollRatio))
            ),
          } as React.CSSProperties
        }
      >
        <div
          className={`scarce-writing-read-progress${
            scrubbing ? ' is-scrubbing' : ''
          }${!hasWriting ? ' is-disabled' : ''}`}
        >
          <div className="scarce-writing-read-progress-rail" aria-hidden>
            <div className="scarce-writing-read-progress-fill" />
            <span className="scarce-writing-read-progress-knob" />
          </div>
          <input
            type="range"
            className="scarce-writing-read-progress-scrub"
            min={0}
            max={progressSteps}
            step={1}
            value={progressValue}
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            disabled={!hasWriting}
            onPointerDown={(event) => {
              if (!hasWriting) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              beginScrub();
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width > 0) {
                seekReading((event.clientX - rect.left) / rect.width);
              }
            }}
            onPointerMove={(event) => {
              if (!scrubbingRef.current || !hasWriting) return;
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width <= 0) return;
              seekReading((event.clientX - rect.left) / rect.width);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              endScrub();
            }}
            onPointerCancel={endScrub}
            onChange={(event) => {
              seekReading(Number(event.target.value) / progressSteps);
            }}
          />
        </div>

        <div className="scarce-writing-read-hero">
          <div
            className="scarce-writing-read-hero-glass"
            aria-hidden
            style={frostStyle}
          />
          <div className="scarce-writing-read-mast">
            {inlineSvg && !rasterCover ? (
              <button
                type="button"
                className="scarce-writing-read-art"
                aria-label="View cover"
                onClick={() => setCoverOpen(true)}
              >
                <div
                  className="scarce-writing-read-cover scarce-writing-read-cover--svg"
                  dangerouslySetInnerHTML={{ __html: inlineSvg }}
                />
              </button>
            ) : rasterCover ? (
              <button
                type="button"
                className="scarce-writing-read-art"
                aria-label="View cover"
                onClick={() => setCoverOpen(true)}
              >
                <img
                  src={rasterCover}
                  alt=""
                  className="scarce-writing-read-cover"
                />
              </button>
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
              onScrollDelta={onScrollDelta}
              onChromeTap={onChromeTap}
              seekProgressRef={seekProgressRef}
            />
          ) : (
            <p className="scarce-feed-medium-empty">
              {!hydrateSettled
                ? 'Loading writing…'
                : 'Writing unavailable for this Drop.'}
            </p>
          )}
        </div>
      </div>

      {(rasterCover || inlineSvg) && coverOpen ? (
        <DropArtOverlay
          open={coverOpen}
          src={rasterCover ?? undefined}
          svg={inlineSvg && !rasterCover ? inlineSvg : null}
          label={name}
          onClose={() => setCoverOpen(false)}
        />
      ) : null}
    </OsSlideOverScreen>
  );
}
