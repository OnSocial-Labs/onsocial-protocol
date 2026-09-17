'use client';

import { useCallback, useState, type ReactNode } from 'react';
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
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

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
 * Writing reader — OS phone-card slide (not full browser). Jacket is the
 * header: cover + title + close. Subtle progress hairline on the slide top.
 * No scroll-quiet — chrome stays so reading space isn’t reclaimed then lost.
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
  const [wasOpen, setWasOpen] = useState(open);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [coverOpen, setCoverOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setScrollRatio(0);
      setCoverOpen(false);
    } else {
      setCoverOpen(false);
    }
  }

  const onReadingProgress = useCallback((ratio: number) => {
    setScrollRatio(ratio);
  }, []);

  const name = title.trim() || 'Drop';
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const progressPct = Math.round(Math.min(1, Math.max(0, scrollRatio)) * 100);
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
      elevateChrome={false}
      closeAriaLabel="Back from reader"
      zIndex={SCARCE_Z.listenShell}
      className="scarce-read-slide"
      contentClassName="scarce-read-slide-body"
      footer={connectFooter}
    >
      <div
        className={`scarce-writing-read${
          connectLocked ? ' is-connect-locked' : ''
        }`}
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

        <div className="scarce-writing-read-hero">
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
