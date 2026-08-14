'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
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
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  dropFacetFieldLabel,
  dropFacetsLabel,
} from '@/features/scarces/drop-facets';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import {
  formatRoyaltyPercent,
  MARKETPLACE_FEE_BPS,
  totalRoyaltyBps,
} from '@/features/scarces/scarce-royalty';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
} from '@/lib/app-config';
import { appPath, seriesPagePath } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';
import { fallbackLabel } from '@/lib/profile-display';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

function mintModeLabel(mode: string): string {
  const key = mode.trim().toLowerCase();
  if (key === 'purchase_only') return 'Purchase only';
  if (key === 'creator_only') return 'Creator only';
  if (key === 'open' || key === 'allowlist') return 'Open';
  return mode.trim() || 'Open';
}

function scheduleCopy(
  view: CollectionView,
  nowMs: number
): { label: string; detail: string | null } {
  const status = deriveCollectionStatus(view, nowMs);
  if (status === 'upcoming' && view.startTimeMs) {
    const abs = formatPageDrawerJoinedFullLabel(view.startTimeMs);
    const rel = formatMarketRelativeTime(view.startTimeMs);
    return {
      label: abs ? `Opens ${abs}` : 'Upcoming',
      detail: rel ? `Opens ${rel}` : null,
    };
  }
  if (status === 'live' && view.endTimeMs) {
    const abs = formatPageDrawerJoinedFullLabel(view.endTimeMs);
    const rel = formatMarketRelativeTime(view.endTimeMs);
    return {
      label: abs ? `Closes ${abs}` : 'Live',
      detail: rel ? `Closes ${rel}` : null,
    };
  }
  if (status === 'ended' && view.endTimeMs) {
    const abs = formatPageDrawerJoinedFullLabel(view.endTimeMs);
    return {
      label: abs ? `Closed ${abs}` : 'Ended',
      detail: null,
    };
  }
  if (view.startTimeMs == null && view.endTimeMs == null) {
    return { label: 'No timed window', detail: null };
  }
  return { label: collectionStatusLabel(status), detail: null };
}

/**
 * Drop twin of guild / hub facts — mint rules, schedule, provenance, explorer.
 */
export function CollectionFactsSheet({
  open,
  onClose,
  view,
  nowMs,
}: {
  open: boolean;
  onClose: () => void;
  view: CollectionView;
  nowMs: number;
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

  const status = deriveCollectionStatus(view, nowMs);
  const schedule = scheduleCopy(view, nowMs);
  const facetsLabel = dropFacetsLabel(view.facets);
  const createdLabel =
    view.createdAtMs > 0
      ? formatPageDrawerJoinedFullLabel(view.createdAtMs)
      : null;
  const priceLabel =
    view.priceYocto === '0' || view.priceNear == null
      ? 'Free'
      : `${view.priceNear} NEAR`;
  const walletCap =
    view.maxPerWallet == null || view.maxPerWallet <= 0
      ? 'No per-wallet limit'
      : view.maxPerWallet === 1
        ? '1 per wallet'
        : `${view.maxPerWallet} per wallet`;
  const editionLabel = view.isVariations
    ? view.randomAssignment
      ? 'Unique · random seat'
      : 'Unique · sequential'
    : 'Shared artwork';
  const rightsParts = [
    view.transferable ? 'Transferable' : 'Soulbound',
    view.renewable ? 'Renewable' : null,
    view.maxRedeems != null && view.maxRedeems > 0
      ? view.maxRedeems === 1
        ? '1 redeem'
        : `${view.maxRedeems} redeems`
      : null,
  ].filter(Boolean);
  const contractHref = `${ACTIVE_NEAR_EXPLORER_URL}/address/${SCARCES_CONTRACT}`;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Drop"
      copy={view.title}
      closeAriaLabel="Close drop facts"
      backdropLabel="Close drop facts"
      zIndex={57}
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-facts">
        <SheetFactSection title="Mint">
          <SheetFactRow label="Status" value={collectionStatusLabel(status)} />
          <SheetFactRow label="Schedule" value={schedule.label} />
          {schedule.detail && schedule.detail !== schedule.label ? (
            <SheetFactCopy>{schedule.detail}</SheetFactCopy>
          ) : null}
          <SheetFactRow label="Price" value={priceLabel} />
          <SheetFactRow
            label="Marketplace fee"
            value={`${formatRoyaltyPercent(MARKETPLACE_FEE_BPS)}%`}
          />
          {view.appId ? (
            <SheetFactRow
              label="Hub commission"
              value={
                view.appCommissionBps == null
                  ? 'Per hub'
                  : view.appCommissionBps === 0
                    ? 'None'
                    : `${formatRoyaltyPercent(view.appCommissionBps)}%`
              }
            />
          ) : null}
          <SheetFactRow
            label="Supply"
            value={`${view.minted} / ${view.totalSupply} minted`}
          />
          <SheetFactRow label="Wallet cap" value={walletCap} />
          <SheetFactRow
            label="Access"
            value={
              view.hasAllowlist
                ? `${mintModeLabel(view.mintMode)} · early access`
                : mintModeLabel(view.mintMode)
            }
          />
          <SheetFactRow label="Editions" value={editionLabel} />
          <SheetFactRow
            label="Resale royalty"
            value={
              totalRoyaltyBps(view.royalty) > 0 ? (
                <span className="scarce-royalty-facts">
                  <span>
                    {formatRoyaltyPercent(totalRoyaltyBps(view.royalty))}%
                  </span>
                  {view.royalty
                    ? (() => {
                        const entries = Object.entries(view.royalty)
                          .filter(([, bps]) => Number(bps) > 0)
                          .sort((a, b) => Number(b[1]) - Number(a[1]));
                        const showRecipients =
                          entries.length > 1 ||
                          (entries.length === 1 &&
                            entries[0][0].toLowerCase() !==
                              view.creatorId.trim().toLowerCase());
                        if (!showRecipients) return null;
                        return (
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
                        );
                      })()
                    : null}
                </span>
              ) : (
                'None'
              )
            }
          />
          {rightsParts.length > 0 ? (
            <SheetFactRow label="Rights" value={rightsParts.join(' · ')} />
          ) : null}
        </SheetFactSection>

        <Divider variant="detail" />

        <SheetFactSection title="Details">
          <SheetFactRow
            label="Creator"
            value={
              <Link
                href={portfolioPath(view.creatorId)}
                className="guild-facts-link group"
                scroll={false}
                onClick={requestClose}
              >
                <span className="guild-facts-link-label">
                  @{fallbackLabel(view.creatorId)}
                </span>
                <ProtocolMotionArrow className="guild-facts-link-arrow" />
              </Link>
            }
          />
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
          {view.appId ? (
            <SheetFactRow
              label="Hub"
              value={
                <Link
                  href={appPath(view.appId)}
                  className="guild-facts-link group"
                  scroll={false}
                  onClick={requestClose}
                >
                  <span className="guild-facts-link-label">{view.appId}</span>
                  <ProtocolMotionArrow className="guild-facts-link-arrow" />
                </Link>
              }
            />
          ) : null}
          {view.kind ? (
            <SheetFactRow
              label="Kind"
              value={view.kind.charAt(0).toUpperCase() + view.kind.slice(1)}
            />
          ) : null}
          {facetsLabel ? (
            <SheetFactRow
              label={dropFacetFieldLabel(view.kind)}
              value={facetsLabel}
            />
          ) : null}
          {createdLabel ? (
            <SheetFactRow label="Created" value={createdLabel} />
          ) : null}
          <SheetFactRow
            label="ID"
            value={<span className="guild-facts-id">{view.collectionId}</span>}
          />
        </SheetFactSection>

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
        </SheetFactSection>
      </div>
    </OsHugSheet>
  );
}
