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
import {
  accessEndsScheduleFacts,
  collectionShouldShowAccessEnds,
} from '@/features/scarces/access-ends-facts';
import { ticketEventScheduleFacts } from '@/features/scarces/ticket-event-facts';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { seriesPagePath } from '@/lib/app-routes';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

/**
 * One-line drop blurb. Shows inline “…” when the line truncates, or when
 * `hasMore` — About has Event / other metadata beyond this one-liner.
 */
export function CollectionAboutTeaser({
  text,
  onReadMore,
  hasMore = false,
}: {
  text: string;
  onReadMore: () => void;
  /** Show … even when the line fits — About holds more than this teaser. */
  hasMore?: boolean;
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

  if (!trimmed && !hasMore) return null;

  const showExpand = truncated || hasMore;
  const line = trimmed || 'About';

  return (
    <div
      className={`collection-about-teaser${showExpand ? ' is-truncated' : ''}`}
    >
      <p ref={lineRef} className="collection-about-teaser-line">
        {line}
      </p>
      {showExpand ? (
        <button
          type="button"
          className="collection-about-read-more"
          onClick={onReadMore}
          aria-label={hasMore && !truncated ? 'More details' : 'Read more'}
        >
          …
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
  const [nowMs] = useState(() => Date.now());
  const event = ticketEventScheduleFacts(view, nowMs);
  const showEvent = !event.empty;
  const access = accessEndsScheduleFacts(view.accessEndsAtMs, nowMs);
  const showAccess = collectionShouldShowAccessEnds(view, nowMs) && !access.empty;
  const showStory = showEvent || showAccess;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      chrome="facts"
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

        {showEvent ? (
          <>
            {description ? <Divider variant="detail" /> : null}
            <SheetFactSection title="Event">
              {event.place ? (
                <SheetFactRow label="Place" value={event.place} />
              ) : null}
              {event.starts ? (
                <SheetFactRow label="Starts" value={event.starts} />
              ) : null}
              {event.ends ? (
                <SheetFactRow label="Ends" value={event.ends} />
              ) : null}
              {event.next ? <SheetFactCopy>{event.next}</SheetFactCopy> : null}
            </SheetFactSection>
          </>
        ) : null}

        {showAccess ? (
          <>
            {description || showEvent ? <Divider variant="detail" /> : null}
            <SheetFactSection title="Access">
              {access.ends ? (
                <SheetFactRow label="Ends" value={access.ends} />
              ) : null}
              {access.next ? <SheetFactCopy>{access.next}</SheetFactCopy> : null}
            </SheetFactSection>
          </>
        ) : null}

        {view.seriesId || createdAbs ? (
          <>
            {description || showStory ? <Divider variant="detail" /> : null}
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
