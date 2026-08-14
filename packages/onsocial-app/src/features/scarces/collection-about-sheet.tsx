'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Divider,
  OsHugSheet,
  ProtocolMotionArrow,
} from '@onsocial/ui';
import {
  SheetFactCopy,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import type { CollectionView } from '@/features/scarces/collections-data';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { seriesPagePath } from '@/lib/app-routes';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

/**
 * One-line drop blurb. Shows an inline “more” only when the line truncates.
 */
export function CollectionAboutTeaser({
  text,
  onReadMore,
}: {
  text: string;
  onReadMore: () => void;
}) {
  const lineRef = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);
  const trimmed = text.trim();

  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;

    const measure = () => {
      setTruncated(el.scrollWidth > el.clientWidth + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [trimmed]);

  if (!trimmed) return null;

  return (
    <div
      className={`collection-about-teaser${truncated ? ' is-truncated' : ''}`}
    >
      <p ref={lineRef} className="collection-about-teaser-line">
        {trimmed}
      </p>
      {truncated ? (
        <button
          type="button"
          className="collection-about-read-more"
          onClick={onReadMore}
        >
          more
        </button>
      ) : null}
    </div>
  );
}

/**
 * Drop story sheet — full description plus light context (series, created).
 * Mint/commerce specs stay in CollectionFactsSheet.
 */
export function CollectionAboutSheet({
  open,
  onClose,
  view,
}: {
  open: boolean;
  onClose: () => void;
  view: CollectionView;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const description = view.description?.trim() ?? '';

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const createdAbs =
    view.createdAtMs > 0
      ? formatPageDrawerJoinedFullLabel(view.createdAtMs)
      : null;
  const createdRel =
    view.createdAtMs > 0 ? formatMarketRelativeTime(view.createdAtMs) : null;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="About"
      copy={view.title}
      closeAriaLabel="Close about"
      backdropLabel="Close about"
      zIndex={57}
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-facts collection-about-sheet">
        {description ? (
          <p className="collection-about-body">{description}</p>
        ) : null}

        {view.seriesId || createdAbs ? (
          <>
            {description ? <Divider variant="detail" /> : null}
            <SheetFactSection title="Details">
              {view.seriesId ? (
                <SheetFactRow
                  label="Series"
                  value={
                    <Link
                      href={seriesPagePath(view.creatorId, view.seriesId)}
                      className="guild-facts-link group"
                      scroll={false}
                      onClick={requestClose}
                    >
                      <span className="guild-facts-link-label">
                        {view.seriesTitle ?? view.seriesId}
                      </span>
                      <ProtocolMotionArrow className="guild-facts-link-arrow" />
                    </Link>
                  }
                />
              ) : null}
              {createdAbs ? (
                <>
                  <SheetFactRow label="Created" value={createdAbs} />
                  {createdRel && createdRel !== createdAbs ? (
                    <SheetFactCopy>{createdRel}</SheetFactCopy>
                  ) : null}
                </>
              ) : null}
            </SheetFactSection>
          </>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
