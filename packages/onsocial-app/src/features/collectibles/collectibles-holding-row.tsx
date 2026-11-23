'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { CatalogThumbImage } from '@/components/ui/catalog-thumb-image';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { formatMarketVerbStamp } from '@/features/market/market-listings';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
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
  heldEditionDestination,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { DropOverlayLink } from '@/features/scarces/drop-overlay-open';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import { collectionPath } from '@/lib/app-routes';
import { OsRowAction } from '@/lib/os-row-action';
import { scarceRowPartyLead } from '@/lib/scarce-row-kind';

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
export function collectiblesFoldedSale(editions: readonly HoldingSalePeek[]): {
  listedCount: number;
  ask: string | null;
  allAuction: boolean;
} {
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
 * Collapsed count and sale state. Kind lives on the party lead when the maker
 * face is shown; pass `omitKind` then so the fact line does not repeat it.
 */
export function collectiblesHoldingFact(
  item: Pick<PortfolioHoldingPeek, 'kindLabel'> & HoldingSalePeek,
  editionCount = 1,
  editions?: readonly HoldingSalePeek[],
  opts?: { omitKind?: boolean }
): string {
  const kind = opts?.omitKind ? '' : item.kindLabel.trim();
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
  const { accountId: viewerAccountId } = useAppWallet();
  const creatorId = item.creatorId?.trim() || null;
  const mintedRel =
    item.mintedAtMs != null && item.mintedAtMs > 0
      ? formatMarketVerbStamp('Minted', item.mintedAtMs)
      : '';
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [passMounted, setPassMounted] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [readMounted, setReadMounted] = useState(false);
  const [readCreatorId, setReadCreatorId] = useState<string | null>(null);
  const [readSourcePostPath, setReadSourcePostPath] = useState<string | null>(
    null
  );
  const showThumb = Boolean(item.mediaUrl) && brokenMediaUrl !== item.mediaUrl;
  const collectionId = item.collectionId?.trim() || '';
  const opensPass = isPassMediumKind(item.mediumKind) && Boolean(collectionId);
  const dropHref = collectionId ? collectionPath(collectionId) : null;
  const dropInitial =
    opensPass && collectionId
      ? seedCollectionViewFromPeek({
          collectionId,
          title: item.title,
          coverUrl: item.mediaUrl,
          creatorId: item.creatorId,
          kind: item.mediumKind,
          audioFormat: item.audioFormat ?? null,
        })
      : null;
  const readDestination = heldEditionDestination({
    tokenId: item.tokenId,
    collectionId,
    sourcePostPath: item.sourcePostPath ?? undefined,
    mediumKind: item.mediumKind,
  });
  /** Folio reader on the vault page — same as Just sold / drop overlay embedded Read. */
  const opensInPlaceRead =
    item.actionLabel === 'Read' &&
    Boolean(collectionId) &&
    (readDestination.type === 'reader' || readDestination.type === 'article');
  const showMaker = Boolean(creatorId) && !hideCreator;
  const fact = collectiblesHoldingFact(item, editionCount, item.editions, {
    omitKind: showMaker,
  });
  const partyLead = scarceRowPartyLead({
    mediumKind: item.mediumKind,
    audioFormat: item.audioFormat ?? null,
  });
  const seatMark = heldEditionRowMark(item.tokenId, editionCount);
  const rowHref = opensPass ? dropHref : item.href;

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
      ) : opensPass && dropHref ? (
        <DropOverlayLink
          href={dropHref}
          initial={dropInitial}
          className="market-listing-row-open"
          aria-label={`Open drop for ${item.title}`}
        />
      ) : rowHref ? (
        <Link
          href={rowHref}
          scroll={false}
          className="market-listing-row-open"
          aria-label={item.title}
        />
      ) : null}
      <div
        className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
        aria-hidden
      >
        {showThumb ? (
          <CatalogThumbImage
            src={item.mediaUrl!}
            onError={() => setBrokenMediaUrl(item.mediaUrl ?? null)}
          />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </div>
      <div className="drops-discovery-body">
        <div className="drops-discovery-top">
          <div className="market-listing-head drops-discovery-head">
            <div className="collectibles-holding-title-block">
              <p className="market-listing-title">{item.title}</p>
              {seatMark ? (
                <p className="collectibles-holding-edition">{seatMark}</p>
              ) : null}
            </div>
          </div>
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
          </div>
        </div>
        <div className="drops-discovery-ledger">
          <div className="drops-discovery-stack">
            {showMaker && creatorId ? (
              <DiscoveryPartyStack
                accountId={creatorId}
                displayName={authorDisplayName}
                avatarUrl={authorAvatarUrl}
                lead={partyLead}
              />
            ) : null}
            {fact ? (
              <p className="market-listing-meta market-listing-meta--price">
                <span className="market-listing-own">{fact}</span>
              </p>
            ) : null}
          </div>
          <div className="market-listing-action-col drops-discovery-action-col collectibles-holding-action-col">
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
            ) : opensInPlaceRead ? (
              <OsRowAction
                className="collectibles-holding-action"
                aria-label={`${item.actionLabel} ${item.title}`}
                onClick={() => {
                  if (!collectionId) return;
                  setReadCreatorId(creatorId);
                  setReadSourcePostPath(item.sourcePostPath?.trim() || null);
                  setReadMounted(true);
                  setReadOpen(true);
                  void fetchCollectionPreferIndexer(collectionId)
                    .then((view) => {
                      const nextCreator = view?.creatorId?.trim() || null;
                      const nextPath = view?.sourcePostPath?.trim() || null;
                      if (nextCreator) setReadCreatorId(nextCreator);
                      if (nextPath) setReadSourcePostPath(nextPath);
                    })
                    .catch(() => {
                      /* shelf byline still uses row creator / path */
                    });
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
        </div>
      </div>
      {opensInPlaceRead && readMounted ? (
        <WritingReadSheet
          open={readOpen}
          onClose={() => setReadOpen(false)}
          title={item.title}
          cover={item.mediaUrl}
          collectionId={collectionId}
          tokenId={item.tokenId}
          accountId={viewerAccountId}
          creatorId={readCreatorId ?? creatorId}
          readables={[]}
          canRead
          lockedHint=""
          sourcePostPath={readSourcePostPath ?? item.sourcePostPath}
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
