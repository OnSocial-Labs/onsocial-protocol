'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import { listedArticleReaderHref } from '@/features/scarces/drop-writing';
import { OwnedShowPassSheet } from '@/features/scarces/owned-show-pass-sheet';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import {
  appendEach,
  quantityMark,
} from '@/features/scarces/quantity-count-format';
import { heldEditionRowMark } from '@/features/collectibles/held-editions';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import { isPassMediumKind } from '@/features/scarces/ticket-pass-payload';
import { socialTimeProps } from '@/lib/post-display';
import {
  holdingsReadHref,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { collectionPath } from '@/lib/app-routes';
import { OsRowAction } from '@/lib/os-row-action';

interface CollectiblesHoldingRowProps {
  item: PortfolioHoldingPeek & { editions?: PortfolioHoldingPeek[] };
  /** Collapsed edition count when several tokens share one collection. */
  editionCount?: number;
  /** Grouped drop: the row opens the edition list instead of the drop. */
  onOpenEditions?: () => void;
  /** Owner-only manage menu — rendered beside the received time. */
  ownerMenu?: ReactNode;
  /** Hide the maker when the row already sits under a creator heading. */
  hideCreator?: boolean;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
}

function formatHoldingPrice(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Ask for the row. The dollar sticker wins; a zero NEAR ask stays quiet. */
export function collectiblesHoldingAsk(
  item: Pick<PortfolioHoldingPeek, 'listedPriceNear' | 'listedUsdE6'>
): string | null {
  const dollars = dollarStickerLabel(item.listedUsdE6);
  if (dollars) return dollars;
  const near = item.listedPriceNear?.trim() || '';
  if (!near || !Number.isFinite(Number.parseFloat(near))) return null;
  if (Number.parseFloat(near) <= 0) return null;
  return `${formatHoldingPrice(near)} NEAR`;
}

type HoldingSalePeek = Pick<
  PortfolioHoldingPeek,
  'listedPriceNear' | 'listedUsdE6' | 'listingKind'
>;

/** How many folded copies are on sale, and whether they share one ask. */
export function collectiblesFoldedSale(
  editions: readonly HoldingSalePeek[]
): { listedCount: number; ask: string | null; allAuction: boolean } {
  const listed = editions.filter((entry) => entry.listingKind != null);
  const asks = new Set(
    listed.map((entry) => collectiblesHoldingAsk(entry) ?? '')
  );
  return {
    listedCount: listed.length,
    ask: asks.size === 1 ? [...asks][0] || null : null,
    allAuction:
      listed.length > 0 && listed.every((e) => e.listingKind === 'auction'),
  };
}

/**
 * Kind, collapsed count, and the sale state. `×2 · $1 each` only when every
 * folded copy is really listed at that ask — otherwise a quiet listed count.
 */
export function collectiblesHoldingFact(
  item: Pick<PortfolioHoldingPeek, 'kindLabel'> & HoldingSalePeek,
  editionCount = 1,
  editions?: readonly HoldingSalePeek[]
): string {
  const kind = item.kindLabel.trim();
  const count = quantityMark(editionCount) ?? '';
  const parts = [kind, count];
  if (editionCount > 1 && editions && editions.length > 1) {
    const folded = collectiblesFoldedSale(editions);
    if (folded.listedCount === 0) return parts.filter(Boolean).join(' · ');
    const allListed = folded.listedCount === editionCount;
    if (allListed && folded.ask) {
      if (folded.allAuction) parts.push('Reserve');
      parts.push(appendEach(folded.ask, editionCount));
    } else {
      parts.push(
        folded.listedCount === 1 ? '1 listed' : `${folded.listedCount} listed`
      );
    }
    return parts.filter(Boolean).join(' · ');
  }
  const ask = collectiblesHoldingAsk(item);
  if (ask) {
    const amount = appendEach(ask, editionCount);
    if (item.listingKind === 'auction') parts.push('Reserve');
    parts.push(amount);
  }
  return parts.filter(Boolean).join(' · ');
}

/** Owned scarce in the Collectibles vault — use-first CTA (Read / Play / …). */
export function CollectiblesHoldingRow({
  item,
  editionCount = 1,
  onOpenEditions,
  ownerMenu = null,
  hideCreator = false,
  authorDisplayName = null,
  authorAvatarUrl = null,
}: CollectiblesHoldingRowProps) {
  const router = useRouter();
  const { accountId: viewerAccountId } = useAppWallet();
  const creatorId = item.creatorId?.trim() || null;
  const mintedRel =
    item.mintedAtMs != null && item.mintedAtMs > 0
      ? formatMarketRelativeTime(item.mintedAtMs)
      : '';
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [passMounted, setPassMounted] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [readMounted, setReadMounted] = useState(false);
  const [readPending, setReadPending] = useState(false);
  const showThumb = Boolean(item.mediaUrl) && brokenMediaUrl !== item.mediaUrl;
  const collectionId = item.collectionId?.trim() || '';
  const opensPass = isPassMediumKind(item.mediumKind) && Boolean(collectionId);
  const dropHref = collectionId ? collectionPath(collectionId) : null;
  const articleReadHref = holdingsReadHref({
    mediumKind: item.mediumKind,
    sourcePostPath: item.sourcePostPath,
  });
  const opensCollectedRead =
    item.actionLabel === 'Read' && !articleReadHref && Boolean(collectionId);
  const fact = collectiblesHoldingFact(item, editionCount, item.editions);
  const seatMark = heldEditionRowMark(item.tokenId, editionCount);
  const showMaker = Boolean(creatorId) && !hideCreator;
  const rowHref = opensPass ? dropHref : item.href;

  const mainBody = (
    <>
      <div
        className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
        aria-hidden
      >
        {showThumb ? (
          <img
            src={item.mediaUrl!}
            alt=""
            onError={() => setBrokenMediaUrl(item.mediaUrl ?? null)}
          />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </div>
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head drops-discovery-head">
          <div className="collectibles-holding-title-block">
            <p className="market-listing-title">{item.title}</p>
            {seatMark ? (
              <p className="collectibles-holding-edition">{seatMark}</p>
            ) : null}
          </div>
        </div>
        {showMaker && creatorId ? (
          <DiscoveryPartyStack
            accountId={creatorId}
            displayName={authorDisplayName}
            avatarUrl={authorAvatarUrl}
            lead="by"
          />
        ) : null}
        {fact ? (
          <p className="market-listing-meta market-listing-meta--price">
            <span className="market-listing-own">{fact}</span>
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className="market-listing-row collectibles-holding-row"
      role="listitem"
    >
      {onOpenEditions ? (
        <button
          type="button"
          className="market-listing-row-open"
          aria-label={`Choose an edition of ${item.title}`}
          onClick={onOpenEditions}
        />
      ) : rowHref ? (
        <Link
          href={rowHref}
          scroll={false}
          className="market-listing-row-open"
          aria-label={opensPass ? `Open drop for ${item.title}` : item.title}
        />
      ) : null}
      <div className="collectibles-holding-row-main">{mainBody}</div>
      <div className="market-listing-action-col drops-discovery-action-col collectibles-holding-action-col">
        <div className="drops-discovery-head-trail">
          {mintedRel && item.mintedAtMs != null ? (
            <time
              className="market-listing-meta-right"
              {...socialTimeProps(item.mintedAtMs)}
            >
              {mintedRel}
            </time>
          ) : null}
          {ownerMenu}
        </div>
        {onOpenEditions ? (
          <OsRowAction
            className="collectibles-holding-action"
            aria-label={`${item.actionLabel} ${item.title}`}
            onClick={onOpenEditions}
          >
            {item.actionLabel}
          </OsRowAction>
        ) : opensPass ? (
          <OsRowAction
            className="collectibles-holding-action"
            aria-label={`${item.actionLabel} ${item.title}`}
            onClick={() => {
              setPassMounted(true);
              setPassOpen(true);
            }}
          >
            {item.actionLabel}
          </OsRowAction>
        ) : articleReadHref ? (
          <OsRowAction
            href={articleReadHref}
            className="collectibles-holding-action"
            aria-label={`${item.actionLabel} ${item.title}`}
          >
            {item.actionLabel}
          </OsRowAction>
        ) : opensCollectedRead ? (
          <OsRowAction
            className="collectibles-holding-action"
            aria-label={`${item.actionLabel} ${item.title}`}
            onClick={() => {
              if (readPending || !collectionId) return;
              setReadPending(true);
              void fetchCollectionPreferIndexer(collectionId)
                .then((view) => {
                  const href = listedArticleReaderHref({
                    writingFormat: view?.writingFormat,
                    sourcePostPath: view?.sourcePostPath ?? item.sourcePostPath,
                  });
                  if (href) {
                    router.push(href);
                    return;
                  }
                  setReadMounted(true);
                  setReadOpen(true);
                })
                .catch(() => {
                  setReadMounted(true);
                  setReadOpen(true);
                })
                .finally(() => setReadPending(false));
            }}
          >
            {item.actionLabel}
          </OsRowAction>
        ) : (
          <OsRowAction
            href={item.href}
            className="collectibles-holding-action"
            aria-label={`${item.actionLabel} ${item.title}`}
          >
            {item.actionLabel}
          </OsRowAction>
        )}
      </div>
      {opensCollectedRead && readMounted ? (
        <WritingReadSheet
          open={readOpen}
          onClose={() => setReadOpen(false)}
          title={item.title}
          cover={item.mediaUrl}
          collectionId={collectionId}
          tokenId={item.tokenId}
          accountId={viewerAccountId}
          creatorId={creatorId}
          readables={[]}
          canRead
          lockedHint=""
          publishedAt={
            item.mintedAtMs != null && item.mintedAtMs > 0
              ? item.mintedAtMs
              : null
          }
        />
      ) : null}
      {opensPass && passMounted ? (
        <OwnedShowPassSheet
          open={passOpen}
          onClose={() => setPassOpen(false)}
          title={item.title}
          cover={item.mediaUrl}
          collectionId={collectionId}
          tokenId={item.tokenId}
        />
      ) : null}
    </div>
  );
}
