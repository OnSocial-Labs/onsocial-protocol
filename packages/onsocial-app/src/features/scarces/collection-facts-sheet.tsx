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
import {
  collectionHasTicketEvent,
  ticketEventScheduleFacts,
} from '@/features/scarces/ticket-event-facts';
import {
  accessEndsScheduleFacts,
  collectionShouldShowAccessEnds,
} from '@/features/scarces/access-ends-facts';
import {
  formatFutureRelativeTime,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
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

function scheduleFacts(
  view: CollectionView,
  nowMs: number
): {
  opens: string | null;
  closes: string | null;
  closesLabel: 'Closes' | 'Closed';
  next: string | null;
  empty: boolean;
} {
  const status = deriveCollectionStatus(view, nowMs);
  const opens =
    view.startTimeMs != null
      ? formatPageDrawerJoinedFullLabel(view.startTimeMs)
      : null;
  const closes =
    view.endTimeMs != null
      ? formatPageDrawerJoinedFullLabel(view.endTimeMs)
      : null;

  let next: string | null = null;
  if (status === 'upcoming' && view.startTimeMs) {
    const rel = formatFutureRelativeTime(view.startTimeMs, nowMs);
    next = rel ? `Opens ${rel}` : null;
  } else if (status === 'live' && view.endTimeMs) {
    const rel = formatFutureRelativeTime(view.endTimeMs, nowMs);
    next = rel ? `Closes ${rel}` : null;
  } else if (status === 'ended' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs, nowMs);
    next = rel ? `Closed ${rel}` : null;
  }

  return {
    opens,
    closes,
    closesLabel: status === 'ended' ? 'Closed' : 'Closes',
    next,
    empty: !opens && !closes,
  };
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
  const schedule = scheduleFacts(view, nowMs);
  const event = ticketEventScheduleFacts(view, nowMs);
  const showEvent = collectionHasTicketEvent(view) && !event.empty;
  const access = accessEndsScheduleFacts(view.accessEndsAtMs, nowMs);
  const showAccess =
    collectionShouldShowAccessEnds(view, nowMs) && !access.empty;
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
    view.renewable
      ? view.kind === 'ticket'
        ? 'Date changes'
        : 'Renewable'
      : null,
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
        {showEvent ? (
          <>
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
            <Divider variant="detail" />
          </>
        ) : null}

        {showAccess ? (
          <>
            <SheetFactSection title="Access">
              {access.ends ? (
                <SheetFactRow label="Ends" value={access.ends} />
              ) : null}
              {access.next ? <SheetFactCopy>{access.next}</SheetFactCopy> : null}
            </SheetFactSection>
            <Divider variant="detail" />
          </>
        ) : null}

        <SheetFactSection title="Mint">
          <SheetFactRow label="Status" value={collectionStatusLabel(status)} />
          {schedule.empty ? (
            <SheetFactRow label="Schedule" value="No timed window" />
          ) : (
            <>
              {schedule.opens ? (
                <SheetFactRow label="Opens" value={schedule.opens} />
              ) : null}
              {schedule.closes ? (
                <SheetFactRow
                  label={schedule.closesLabel}
                  value={schedule.closes}
                />
              ) : null}
            </>
          )}
          {schedule.next ? (
            <SheetFactCopy>{schedule.next}</SheetFactCopy>
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
