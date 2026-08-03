'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Divider,
  GlassSheet,
  ProtocolMotionArrow,
  SheetHeader,
} from '@onsocial/ui';
import type { CollectionView } from '@/features/scarces/collections-data';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { seriesPagePath } from '@/lib/app-routes';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="guild-facts-row">
      <span className="guild-facts-label">{label}</span>
      <span className="guild-facts-value">{value}</span>
    </div>
  );
}

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
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const description = view.description?.trim() ?? '';

  useScrollLock(open || closing);

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
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={57}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close about"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="About"
            subtitle={view.title}
            onClose={requestClose}
            closeAriaLabel="Close about"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="guild-facts collection-about-sheet">
        {description ? (
          <p className="collection-about-body">{description}</p>
        ) : null}

        {view.seriesId || createdAbs ? (
          <>
            {description ? <Divider variant="detail" /> : null}
            <section className="guild-facts-section">
              <h3 className="guild-facts-section-title">Details</h3>
              <div className="guild-facts-section-rows">
                {view.seriesId ? (
                  <MetaRow
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
                    <MetaRow label="Created" value={createdAbs} />
                    {createdRel && createdRel !== createdAbs ? (
                      <p className="guild-facts-copy">{createdRel}</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </GlassSheet>
  );
}
