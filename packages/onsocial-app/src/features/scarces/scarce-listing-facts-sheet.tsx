'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  Divider,
  OsHugSheet,
  ProtocolMotionArrow,
} from '@onsocial/ui';
import {
  SheetFactRow,
  SheetFactSection,
} from '@/components/ui/sheet-facts';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { marketMediumLabel } from '@/features/market/market-medium';
import {
  formatRoyaltyPercent,
  MARKETPLACE_FEE_BPS,
  totalRoyaltyBps,
} from '@/features/scarces/scarce-royalty';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
} from '@/lib/app-config';
import { collectionPath } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';
import { fallbackLabel } from '@/lib/profile-display';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export interface ScarceListingFacts {
  title: string;
  /** Primary mint vs secondary resale / auction. */
  kind: 'mint' | 'resale' | 'auction';
  askNear?: string | null;
  mintPriceNear?: string | null;
  mintedAtMs?: number | null;
  listedAtMs?: number | null;
  copies?: number | null;
  remaining?: number | null;
  mediumKind?: string | null;
  authorId?: string | null;
  sellerId?: string | null;
  sourcePostPath?: string | null;
  postHref?: string | null;
  collectionId?: string | null;
  tokenId?: string | null;
  listingId?: string | null;
  /**
   * Resale royalty when resolved (Drop collection, lazy listing, or token).
   * `null`/omit = unknown; `{}` = none; non-empty = cut.
   */
  royalty?: Record<string, number> | null;
}

function formatNear(priceNear: string | null | undefined): string | null {
  if (!priceNear?.trim()) return null;
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return `${priceNear.trim()} NEAR`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`;
}

function kindLabel(kind: ScarceListingFacts['kind']): string {
  if (kind === 'mint') return 'Primary mint';
  if (kind === 'auction') return 'Auction';
  return 'Resale';
}

function RoyaltyValue({
  royalty,
  authorId,
}: {
  royalty: Record<string, number>;
  authorId?: string | null;
}) {
  const total = totalRoyaltyBps(royalty);
  if (total <= 0) return <>None</>;
  const entries = Object.entries(royalty)
    .filter(([, bps]) => Number(bps) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const author = authorId?.trim().toLowerCase() ?? '';
  const showRecipients =
    entries.length > 1 ||
    (entries.length === 1 && entries[0][0].toLowerCase() !== author);
  return (
    <span className="scarce-royalty-facts">
      <span>{formatRoyaltyPercent(total)}%</span>
      {showRecipients ? (
        <span className="scarce-royalty-facts-split">
          {entries.map(([account, bps]) => (
            <span key={account}>
              @{fallbackLabel(account)}
              {entries.length > 1
                ? ` · ${formatRoyaltyPercent(Number(bps))}%`
                : ''}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Compact facts twin of CollectionFactsSheet — for buy / bid commerce drawers.
 */
export function ScarceListingFactsSheet({
  open,
  onClose,
  facts,
  zIndex = SCARCE_Z.nestedOverCommerce,
}: {
  open: boolean;
  onClose: () => void;
  facts: ScarceListingFacts;
  zIndex?: number;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const sourceHref =
    facts.postHref?.trim() ||
    postHrefFromSourcePath(facts.sourcePostPath ?? undefined);
  const medium = marketMediumLabel(facts.mediumKind);
  const ask = formatNear(facts.askNear);
  const mintAsk = formatNear(facts.mintPriceNear);
  const mintedAbs =
    facts.mintedAtMs && facts.mintedAtMs > 0
      ? formatPageDrawerJoinedFullLabel(facts.mintedAtMs)
      : null;
  const mintedRel =
    facts.mintedAtMs && facts.mintedAtMs > 0
      ? formatMarketRelativeTime(facts.mintedAtMs)
      : null;
  const listedAbs =
    facts.listedAtMs && facts.listedAtMs > 0
      ? formatPageDrawerJoinedFullLabel(facts.listedAtMs)
      : null;
  const listedRel =
    facts.listedAtMs && facts.listedAtMs > 0
      ? formatMarketRelativeTime(facts.listedAtMs)
      : null;
  const supply =
    facts.copies != null && facts.copies > 0
      ? facts.remaining != null
        ? `${facts.remaining} of ${facts.copies} left`
        : `${facts.copies} editions`
      : null;
  const showSeller =
    Boolean(facts.sellerId?.trim()) &&
    Boolean(facts.authorId?.trim()) &&
    facts.sellerId!.trim().toLowerCase() !==
      facts.authorId!.trim().toLowerCase();
  const contractHref = `${ACTIVE_NEAR_EXPLORER_URL}/address/${SCARCES_CONTRACT}`;
  const tokenHref = facts.tokenId?.trim()
    ? `${ACTIVE_NEAR_EXPLORER_URL}/nft-token/${SCARCES_CONTRACT}/${encodeURIComponent(facts.tokenId.trim())}`
    : null;
  const royalty = facts.royalty ?? null;
  const hasRoyalty = royalty != null && totalRoyaltyBps(royalty) > 0;
  const hasPeople = Boolean(facts.authorId?.trim()) || showSeller;
  const hasProvenance = Boolean(
    mintedAbs ||
      listedAbs ||
      sourceHref ||
      facts.collectionId?.trim() ||
      facts.tokenId?.trim() ||
      facts.listingId?.trim()
  );

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label={facts.title.trim() || 'Scarce'}
      copy={kindLabel(facts.kind)}
      closeAriaLabel="Close scarce facts"
      backdropLabel="Close scarce facts"
      zIndex={zIndex}
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-facts">
        <SheetFactSection title="Listing">
          <SheetFactRow label="Kind" value={kindLabel(facts.kind)} />
          {ask ? (
            <SheetFactRow
              label={
                facts.kind === 'auction'
                  ? 'Reserve / bid'
                  : facts.kind === 'mint'
                    ? 'Mint price'
                    : 'Ask'
              }
              value={ask}
            />
          ) : null}
          {mintAsk && facts.kind !== 'mint' ? (
            <SheetFactRow label="Original mint" value={mintAsk} />
          ) : null}
          {supply ? <SheetFactRow label="Editions" value={supply} /> : null}
          {medium ? <SheetFactRow label="Medium" value={medium} /> : null}
          <SheetFactRow
            label="Marketplace fee"
            value={`${formatRoyaltyPercent(MARKETPLACE_FEE_BPS)}%`}
          />
          {royalty != null ? (
            <SheetFactRow
              label="Resale royalty"
              value={
                hasRoyalty ? (
                  <RoyaltyValue royalty={royalty} authorId={facts.authorId} />
                ) : (
                  'None'
                )
              }
            />
          ) : null}
        </SheetFactSection>

        {hasPeople ? (
          <>
            <Divider variant="detail" />
            <SheetFactSection title="People">
              {facts.authorId?.trim() ? (
                <SheetFactRow
                  label="Author"
                  value={
                    <Link
                      href={portfolioPath(facts.authorId)}
                      scroll={false}
                      className="guild-facts-link group"
                      onClick={requestClose}
                    >
                      <span className="guild-facts-link-label">
                        @{fallbackLabel(facts.authorId)}
                      </span>
                      <ProtocolMotionArrow className="guild-facts-link-arrow" />
                    </Link>
                  }
                />
              ) : null}
              {showSeller && facts.sellerId?.trim() ? (
                <SheetFactRow
                  label="Seller"
                  value={
                    <Link
                      href={portfolioPath(facts.sellerId)}
                      scroll={false}
                      className="guild-facts-link group"
                      onClick={requestClose}
                    >
                      <span className="guild-facts-link-label">
                        @{fallbackLabel(facts.sellerId)}
                      </span>
                      <ProtocolMotionArrow className="guild-facts-link-arrow" />
                    </Link>
                  }
                />
              ) : null}
            </SheetFactSection>
          </>
        ) : null}

        {hasProvenance ? (
          <>
            <Divider variant="detail" />
            <SheetFactSection title="Provenance">
              {mintedAbs ? (
                <SheetFactRow
                  label="Minted"
                  value={
                    mintedRel ? `${mintedAbs} · ${mintedRel}` : mintedAbs
                  }
                />
              ) : null}
              {listedAbs ? (
                <SheetFactRow
                  label="Listed"
                  value={
                    listedRel ? `${listedAbs} · ${listedRel}` : listedAbs
                  }
                />
              ) : null}
              {sourceHref ? (
                <SheetFactRow
                  label="Source"
                  value={
                    <Link
                      href={sourceHref}
                      scroll={false}
                      className="guild-facts-link scarce-facts-source-link group"
                      onClick={requestClose}
                    >
                      <span className="guild-facts-link-label">
                        Original post
                      </span>
                      <ProtocolMotionArrow className="guild-facts-link-arrow" />
                    </Link>
                  }
                />
              ) : facts.collectionId?.trim() ? (
                <SheetFactRow
                  label="Source"
                  value={
                    <Link
                      href={collectionPath(facts.collectionId.trim())}
                      scroll={false}
                      className="guild-facts-link scarce-facts-source-link group"
                      onClick={requestClose}
                    >
                      <span className="guild-facts-link-label">Drop page</span>
                      <ProtocolMotionArrow className="guild-facts-link-arrow" />
                    </Link>
                  }
                />
              ) : null}
              {facts.tokenId?.trim() ? (
                <SheetFactRow
                  label="Token"
                  value={
                    <span className="guild-facts-id">{facts.tokenId.trim()}</span>
                  }
                />
              ) : null}
              {facts.listingId?.trim() ? (
                <SheetFactRow
                  label="Listing"
                  value={
                    <span className="guild-facts-id">
                      {facts.listingId.trim()}
                    </span>
                  }
                />
              ) : null}
              {facts.collectionId?.trim() ? (
                <SheetFactRow
                  label="Collection"
                  value={
                    <span className="guild-facts-id">
                      {facts.collectionId.trim()}
                    </span>
                  }
                />
              ) : null}
            </SheetFactSection>
          </>
        ) : null}

        <Divider variant="detail" />

        <SheetFactSection title="On-chain">
          <SheetFactRow
            label="Contract"
            value={
              <a
                href={contractHref}
                className="guild-facts-link group"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="guild-facts-link-label">
                  View on Nearblocks
                </span>
                <ProtocolMotionArrow className="guild-facts-link-arrow" />
              </a>
            }
          />
          {tokenHref ? (
            <SheetFactRow
              label="Token"
              value={
                <a
                  href={tokenHref}
                  className="guild-facts-link group"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="guild-facts-link-label">
                    View on Nearblocks
                  </span>
                  <ProtocolMotionArrow className="guild-facts-link-arrow" />
                </a>
              }
            />
          ) : null}
        </SheetFactSection>
      </div>
    </OsHugSheet>
  );
}
