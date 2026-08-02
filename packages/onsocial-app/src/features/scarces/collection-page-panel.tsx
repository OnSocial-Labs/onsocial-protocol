'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ShopFillIcon, osIconActionClassName } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { CollectionAllowlistManager } from '@/features/scarces/collection-allowlist-manager';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  fetchCollection,
  fetchWalletMintRemaining,
  isCollectionMintable,
  type CollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_MARKET_PATH, marketCreatorPath } from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface ActivityRow {
  key: string;
  label: string;
  actor: string | null;
  time: string;
  priceNear: string | null;
}

const NEAR_DECIMALS = 24;

function yoctoToNearDisplay(raw: string | null | undefined): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const padded = raw.padStart(NEAR_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - NEAR_DECIMALS) || '0';
  const frac = padded.slice(padded.length - NEAR_DECIMALS).replace(/0+$/, '');
  const near = frac ? `${whole}.${frac}` : whole;
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

const OPERATION_LABEL: Record<string, string> = {
  create: 'Drop created',
  purchase: 'Collected',
  creator_mint: 'Minted',
  mint_from_collection: 'Collected',
  airdrop: 'Airdropped',
  cancel: 'Cancelled',
  refund: 'Refunded',
  set_allowlist: 'Allowlist updated',
  pause: 'Paused',
  resume: 'Resumed',
};

function statusTone(status: CollectionStatus): string {
  if (status === 'live') return 'is-live';
  if (status === 'sold_out' || status === 'ended' || status === 'cancelled') {
    return 'is-closed';
  }
  return 'is-idle';
}

function scheduleLine(
  view: CollectionView,
  status: CollectionStatus
): string | null {
  if (status === 'upcoming' && view.startTimeMs) {
    const rel = formatMarketRelativeTime(view.startTimeMs);
    return rel ? `Opens ${rel}` : null;
  }
  if (status === 'live' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs);
    return rel ? `Closes ${rel}` : null;
  }
  if (status === 'ended' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs);
    return rel ? `Closed ${rel}` : null;
  }
  return null;
}

export function CollectionPagePanel({
  collectionId,
  initial,
}: {
  collectionId: string;
  initial: CollectionView | null;
}) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [view, setView] = useState<CollectionView | null>(initial);
  const [notFound, setNotFound] = useState(initial == null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [walletRemaining, setWalletRemaining] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  const isOwner =
    Boolean(viewerAccountId) &&
    view != null &&
    accountIdsEqual(viewerAccountId!, view.creatorId);

  // Refresh the live record on mount and after a mint.
  useEffect(() => {
    let cancelled = false;
    void fetchCollection(collectionId).then((next) => {
      if (cancelled) return;
      if (next) {
        setView(next);
        setNotFound(false);
      } else if (!initial) {
        setNotFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, initial, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.scarces
      .collection(collectionId, { limit: 24 })
      .then((rows) => {
        if (cancelled) return;
        setActivity(
          rows.map((row, index) => ({
            key: `${row.operation}:${row.blockTimestamp}:${index}`,
            label: OPERATION_LABEL[row.operation] ?? row.operation,
            actor:
              row.buyerId?.trim() ||
              row.ownerId?.trim() ||
              row.author?.trim() ||
              null,
            time: formatMarketRelativeTime(row.blockTimestamp) ?? '',
            priceNear: yoctoToNearDisplay(row.price ?? row.amount),
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, refreshKey]);

  useEffect(() => {
    if (!viewerAccountId) {
      setWalletRemaining(null);
      return;
    }
    let cancelled = false;
    void fetchWalletMintRemaining(collectionId, viewerAccountId).then(
      (remaining) => {
        if (!cancelled) setWalletRemaining(remaining);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [collectionId, viewerAccountId, refreshKey]);

  const status = view ? deriveCollectionStatus(view, nowMs) : 'ended';
  const mintable = view != null && isCollectionMintable(status);

  // Tick a clock only while a timed drop is counting down.
  const hasClock =
    view != null &&
    ((view.startTimeMs != null && status === 'upcoming') ||
      (view.endTimeMs != null && status === 'live'));
  useEffect(() => {
    if (!hasClock) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasClock]);

  const maxQuantity = useMemo(() => {
    if (!view) return 1;
    const caps = [view.remaining];
    if (walletRemaining != null) caps.push(walletRemaining);
    if (view.maxPerWallet != null) caps.push(view.maxPerWallet);
    const cap = Math.min(...caps.filter((n) => n > 0), 10);
    return Math.max(1, Number.isFinite(cap) ? cap : 1);
  }, [view, walletRemaining]);

  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity));
  }, [maxQuantity]);

  const totalYocto = useMemo(() => {
    if (!view) return '0';
    try {
      return (BigInt(view.priceYocto) * BigInt(quantity)).toString();
    } catch {
      return '0';
    }
  }, [view, quantity]);
  const totalNear = yoctoToNearDisplay(totalYocto);

  const handleMint = useCallback(async () => {
    if (!view || pending || !mintable) return;
    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const isFree = view.priceYocto === '0';
      const response = await client.scarces.collections.purchaseFrom(
        view.collectionId,
        view.priceNear ?? '0',
        {
          quantity,
          ...(isFree ? {} : { depositYocto: totalYocto }),
        }
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.mintingCollection,
        successMessage: txToastSuccess.collectionMinted,
        failureMessage: txToastError.mintCollectionFailed,
      });
      if (!confirmed) return;
      setRefreshKey((k) => k + 1);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.mintCollectionFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    view,
    pending,
    mintable,
    quantity,
    totalYocto,
    getSigningWallet,
    trackTransaction,
    setTxResult,
  ]);

  if (notFound || !view) {
    return (
      <OsAppScreen title="Drop" backFallbackHref={APP_MARKET_PATH}>
        <div className="market-page">
          <p className="market-page-status">
            This drop isn’t available.{' '}
            <Link className="app-soon-link" href={APP_MARKET_PATH}>
              Back to Market
            </Link>
          </p>
        </div>
      </OsAppScreen>
    );
  }

  const progressPct =
    view.totalSupply > 0
      ? Math.min(100, Math.round((view.minted / view.totalSupply) * 100))
      : 0;
  const schedule = scheduleLine(view, status);
  const priceLabel = view.priceNear ? `${view.priceNear} NEAR` : 'Free';
  const mintDisabledReason = !mintable
    ? status === 'sold_out'
      ? 'This drop is sold out.'
      : status === 'upcoming'
        ? 'Minting hasn’t opened yet.'
        : status === 'paused'
          ? 'The creator paused this drop.'
          : status === 'cancelled'
            ? 'This drop was cancelled.'
            : 'This drop has closed.'
    : walletRemaining === 0
      ? 'You’ve reached your limit for this drop.'
      : null;
  const canMint = isConnected && mintable && walletRemaining !== 0 && !pending;

  return (
    <OsAppScreen
      title={view.title}
      backFallbackHref={APP_MARKET_PATH}
      actions={
        <Link
          href={marketCreatorPath(view.creatorId)}
          scroll={false}
          className={osIconActionClassName}
          aria-label="Shop this creator"
        >
          <ShopFillIcon aria-hidden />
        </Link>
      }
    >
      <div className="collection-page">
        <div
          className={`collection-cover${view.mediaUrl ? ' has-media' : ''}`}
          {...(view.cardBg && !view.mediaUrl
            ? { style: { background: view.cardBg } }
            : {})}
        >
          {view.mediaUrl ? <img src={view.mediaUrl} alt="" /> : null}
          <span className={`collection-status ${statusTone(status)}`}>
            {collectionStatusLabel(status)}
          </span>
        </div>

        <div className="collection-head">
          <h2 className="collection-title">{view.title}</h2>
          <Link
            href={portfolioPath(view.creatorId)}
            scroll={false}
            className="collection-creator"
          >
            @{fallbackLabel(view.creatorId)}
          </Link>
          {view.seriesId ? (
            <p className="collection-series-note">
              Part of the {view.seriesTitle ?? view.seriesId} series
            </p>
          ) : null}
          {view.description ? (
            <p className="collection-description">{view.description}</p>
          ) : null}
        </div>

        <div className="collection-stats">
          <div className="collection-progress">
            <div className="collection-progress-head">
              <span className="collection-progress-count">
                {view.minted} / {view.totalSupply} collected
              </span>
              <span className="collection-progress-remaining">
                {view.remaining} left
              </span>
            </div>
            <div
              className="collection-progress-track"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                className="collection-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <dl className="collection-facts">
            <div>
              <dt>Price</dt>
              <dd>{priceLabel}</dd>
            </div>
            {view.isVariations ? (
              <div>
                <dt>Set</dt>
                <dd>{view.totalSupply} unique pieces · 1 of each</dd>
              </div>
            ) : null}
            {schedule ? (
              <div>
                <dt>{status === 'upcoming' ? 'Opens' : 'Window'}</dt>
                <dd>{schedule}</dd>
              </div>
            ) : null}
            {view.allowlistOnly ? (
              <div>
                <dt>Access</dt>
                <dd>Allowlist</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {isOwner ? (
          <div className="collection-owner">
            <p className="collection-owner-note">You created this drop.</p>
            <CollectionAllowlistManager
              collectionId={view.collectionId}
              creatorId={view.creatorId}
            />
          </div>
        ) : null}

        <section className="collection-mint">
          {mintable && !isOwner ? (
            <div className="collection-qty" role="group" aria-label="Quantity">
              <button
                type="button"
                className="collection-qty-btn"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={pending || quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="collection-qty-value" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="collection-qty-btn"
                onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                disabled={pending || quantity >= maxQuantity}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          ) : null}

          <OsSheetActions
            layout="stack"
            tone="frosted-primary"
            borderless
            className="collection-mint-actions"
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready={canMint}
              disabled={!canMint || isOwner}
              onClick={() => {
                void handleMint();
              }}
            >
              {pending
                ? 'Collecting…'
                : !isConnected
                  ? 'Connect to collect'
                  : view.priceYocto === '0'
                    ? 'Collect'
                    : `Collect · ${totalNear} NEAR`}
            </OsSheetAction>
          </OsSheetActions>

          {mintDisabledReason ? (
            <p className="collection-mint-hint">{mintDisabledReason}</p>
          ) : view.isVariations && mintable && !isOwner ? (
            <p className="collection-mint-hint">
              Every piece is one of a kind — you&rsquo;ll receive piece #
              {view.minted + 1}
              {quantity > 1 ? `–#${view.minted + quantity}` : ''} of{' '}
              {view.totalSupply}.
            </p>
          ) : isOwner && mintable ? (
            <p className="collection-mint-hint">
              Creators don’t collect from their own drop. Share the link so fans
              can.
            </p>
          ) : null}
        </section>

        {view.sourcePostPath ? (
          <Link
            href={`/${view.sourcePostPath}`}
            scroll={false}
            className="collection-source-link"
          >
            View the post behind this drop
          </Link>
        ) : null}

        {activity.length > 0 ? (
          <section className="collection-activity" aria-label="Drop activity">
            <h3 className="market-section-title">Activity</h3>
            <ul className="collection-activity-list">
              {activity.map((row) => (
                <li key={row.key} className="collection-activity-row">
                  <span className="collection-activity-label">{row.label}</span>
                  <span className="collection-activity-meta">
                    {row.actor ? (
                      <Link
                        href={portfolioPath(row.actor)}
                        scroll={false}
                        className="market-listing-handle"
                      >
                        @{fallbackLabel(row.actor)}
                      </Link>
                    ) : null}
                    {row.priceNear ? (
                      <span className="collection-activity-price">
                        {row.priceNear} NEAR
                      </span>
                    ) : null}
                    {row.time ? (
                      <span className="collection-activity-time">
                        {row.time}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
