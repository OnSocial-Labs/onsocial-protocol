'use client';

import Link from 'next/link';
import { useCallback, useId, useState, type ReactNode } from 'react';
import {
  Divider,
  GlassSheet,
  ProtocolMotionArrow,
  SheetHeader,
} from '@onsocial/ui';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import {
  formatRoyaltyPercent,
  MARKETPLACE_FEE_BPS,
  totalRoyaltyBps,
} from '@/features/scarces/scarce-royalty';
import { useScrollLock } from '@/hooks/use-scroll-lock';
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

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="guild-facts-row">
      <span className="guild-facts-label">{label}</span>
      <span className="guild-facts-value">{value}</span>
    </div>
  );
}

function FactSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="guild-facts-section">
      <h3 className="guild-facts-section-title">{title}</h3>
      <div className="guild-facts-section-rows">{children}</div>
    </section>
  );
}

function mintModeLabel(mode: string): string {
  const key = mode.trim().toLowerCase();
  if (key === 'allowlist') return 'Allowlist';
  if (key === 'open') return 'Open';
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
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

  useScrollLock(open || closing);

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
      backdropLabel="Close drop facts"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Drop"
            subtitle={view.title}
            onClose={requestClose}
            closeAriaLabel="Close drop facts"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="guild-facts">
        <FactSection title="Mint">
          <FactRow label="Status" value={collectionStatusLabel(status)} />
          <FactRow label="Schedule" value={schedule.label} />
          {schedule.detail && schedule.detail !== schedule.label ? (
            <p className="guild-facts-copy">{schedule.detail}</p>
          ) : null}
          <FactRow label="Price" value={priceLabel} />
          <FactRow
            label="Marketplace fee"
            value={`${formatRoyaltyPercent(MARKETPLACE_FEE_BPS)}%`}
          />
          {view.appId ? (
            <FactRow
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
          <FactRow
            label="Supply"
            value={`${view.minted} / ${view.totalSupply} minted`}
          />
          <FactRow label="Wallet cap" value={walletCap} />
          <FactRow
            label="Access"
            value={
              view.allowlistOnly
                ? 'Allowlist only'
                : mintModeLabel(view.mintMode)
            }
          />
          <FactRow label="Editions" value={editionLabel} />
          <FactRow
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
            <FactRow label="Rights" value={rightsParts.join(' · ')} />
          ) : null}
        </FactSection>

        <Divider variant="detail" />

        <FactSection title="Details">
          <FactRow
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
            <FactRow
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
            <FactRow
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
            <FactRow
              label="Kind"
              value={view.kind.charAt(0).toUpperCase() + view.kind.slice(1)}
            />
          ) : null}
          {createdLabel ? (
            <FactRow label="Created" value={createdLabel} />
          ) : null}
          <FactRow
            label="ID"
            value={<span className="guild-facts-id">{view.collectionId}</span>}
          />
        </FactSection>

        <Divider variant="detail" />

        <FactSection title="On-chain">
          <FactRow
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
        </FactSection>
      </div>
    </GlassSheet>
  );
}
