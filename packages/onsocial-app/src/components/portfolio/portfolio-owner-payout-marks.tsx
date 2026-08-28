'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  FireFillIcon,
  GiftFillIcon,
  MessageFillIcon,
  ShopFillIcon,
  StarsCFillIcon,
} from '@onsocial/ui';
import { useDmUnreadCount } from '@/components/providers/dm-unread-host';
import {
  PortfolioListingActionsMark,
  PortfolioListingActionsSheet,
} from '@/components/portfolio/portfolio-listing-actions-sheet';
import { BOOST_CLAIM_DUST_YOCTO } from '@/features/boost/boost-position';
import { PortfolioBoostSheet } from '@/features/boost/portfolio-boost-sheet';
import { useBoostPosition } from '@/features/boost/use-boost-position';
import { useRallySheet } from '@/features/rally/rally-sheet-host';
import { PortfolioScarceEarningsSheet } from '@/components/portfolio/portfolio-scarce-earnings-sheet';
import { PortfolioSupportCollectInfoSheet } from '@/components/portfolio/portfolio-support-collect-info-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  fetchListingActions,
  type ListingActionItem,
} from '@/features/scarces/listing-actions';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { messagesPath } from '@/lib/app-routes';
import {
  PORTFOLIO_SHEET_PARAM,
  parsePortfolioSheetParam,
} from '@/lib/overlay-routes';
import { buildPathWithQuery } from '@/lib/sync-browser-url-query';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { refreshAppSocialBalanceAfterClaim } from '@/lib/app-social-balance-sync';
import { formatSocialCompact } from '@/lib/format-social-balance';
import {
  fetchScarceCreatorEarnings,
  formatEarningsNearCompact,
  type ScarceCreatorEarningRow,
} from '@/lib/scarce-creator-earnings';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PortfolioOwnerPayoutMarksProps {
  accountId: string;
}

/**
 * Owner face — same gesture chrome as Stand / Endorse / Support:
 * animated mark (reputation gift / endorse shop / listing actions) + quiet
 * amount or count; soft wash. Tap opens drawers. Messages uses the
 * launcher bubble + unread count on the same row.
 */
export function PortfolioOwnerPayoutMarks({
  accountId,
}: PortfolioOwnerPayoutMarksProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dmUnread = useDmUnreadCount();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [claimableYocto, setClaimableYocto] = useState<bigint | null>(null);
  const [salesYocto, setSalesYocto] = useState<string | null>(null);
  const [salesItems, setSalesItems] = useState<ScarceCreatorEarningRow[]>([]);
  const [salesFetchedAt, setSalesFetchedAt] = useState(0);
  const [listingActions, setListingActions] = useState<ListingActionItem[]>([]);
  const [listingsFetchedAt, setListingsFetchedAt] = useState(0);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [collectPending, setCollectPending] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [listingsOpen, setListingsOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(
    () =>
      parsePortfolioSheetParam(searchParams.get(PORTFOLIO_SHEET_PARAM)) ===
      'boost'
  );
  const boost = useBoostPosition(accountId, { live: boostOpen });
  const rally = useRallySheet();

  useEffect(() => {
    if (
      parsePortfolioSheetParam(searchParams.get(PORTFOLIO_SHEET_PARAM)) !==
      'boost'
    ) {
      return;
    }
    queueMicrotask(() => setBoostOpen(true));
  }, [searchParams]);

  const handleBoostOpenChange = useCallback(
    (open: boolean) => {
      setBoostOpen(open);
      if (
        open ||
        parsePortfolioSheetParam(searchParams.get(PORTFOLIO_SHEET_PARAM)) !==
          'boost'
      ) {
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.delete(PORTFOLIO_SHEET_PARAM);
      router.replace(buildPathWithQuery(pathname, next), { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const refreshSupport = useCallback(
    async (options: { fresh?: boolean } = {}) => {
      try {
        const next = await fetchProfileSupportBalanceYocto(accountId, options);
        setClaimableYocto(next);
      } catch {
        // Treat errors as loaded-empty so the row can still settle.
        setClaimableYocto(0n);
      }
    },
    [accountId]
  );

  const refreshSales = useCallback(async () => {
    try {
      // Same page size as the sales sheet — one fetch seeds mark + drawer.
      const page = await fetchScarceCreatorEarnings(accountId, { limit: 40 });
      setSalesYocto(page.totalYocto);
      setSalesItems(page.items);
      setSalesFetchedAt(Date.now());
    } catch {
      setSalesYocto('0');
      setSalesItems([]);
      setSalesFetchedAt(Date.now());
    }
  }, [accountId]);

  const refreshListingActions = useCallback(async () => {
    try {
      const page = await fetchListingActions(accountId);
      setListingActions(page.items);
      setListingsFetchedAt(Date.now());
    } catch {
      setListingActions([]);
      setListingsFetchedAt(Date.now());
    } finally {
      setListingsLoaded(true);
    }
  }, [accountId]);

  useEffect(() => {
    setClaimableYocto(null);
    setSalesYocto(null);
    setSalesItems([]);
    setSalesFetchedAt(0);
    setListingActions([]);
    setListingsFetchedAt(0);
    setListingsLoaded(false);
    void refreshSupport({ fresh: true });
    void refreshSales();
    void refreshListingActions();
  }, [refreshSupport, refreshSales, refreshListingActions]);

  async function handleCollect() {
    if (collectPending || !claimableYocto || claimableYocto <= 0n) return;

    setCollectPending(true);
    try {
      const { client, accountId: signingAccountId, wallet } = await getClient();
      const payload = client.socialSpend.buildClaimTargetBalanceTransaction();
      const payment = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId: signingAccountId,
        receiverId: payload.receiverId,
        actions: payload.actions.map((action) => ({
          type: 'FunctionCall' as const,
          params: {
            methodName: action.methodName,
            args: action.args,
            gas: action.gas,
            deposit: action.deposit,
          },
        })),
      });
      const txHashes = extractNearTransactionHashes(payment);
      const confirmed = await trackTransaction({
        txHashes,
        successMessage: txToastSuccess.supportCollected,
        failureMessage: txToastError.claimSupportFailed,
      });
      if (confirmed) {
        setClaimableYocto(0n);
        setSupportOpen(false);
        await Promise.all([
          refreshSupport({ fresh: true }),
          refreshAppSocialBalanceAfterClaim(),
        ]);
      }
    } catch (cause) {
      if (!isWalletUserCancellation(cause)) {
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.claimSupportFailed,
        });
      }
    } finally {
      setCollectPending(false);
    }
  }

  const showSupport = claimableYocto != null && claimableYocto > 0n;
  const showSales = salesYocto != null && salesYocto !== '0';
  const showListings = listingActions.length > 0;
  /** Wait for every mark — paint the row once so amounts don’t shove each other. */
  const rallyReady =
    rally.occasion.loaded && (!rally.mark.visible || rally.mark.loaded);
  const marksReady =
    claimableYocto != null &&
    salesYocto != null &&
    listingsLoaded &&
    boost.loaded &&
    rallyReady;

  const supportLabel = showSupport
    ? formatSocialCompact(claimableYocto!.toString())
    : '';
  const salesLabel = showSales ? formatEarningsNearCompact(salesYocto!) : '';
  const boostLabel = boost.hasPosition
    ? formatSocialCompact(boost.lockedYocto)
    : '';
  /** Fire nudges when rewards are collectable or the lock can be released. */
  const boostActionable =
    boost.hasPosition &&
    (boost.canUnlock || boost.claimableYocto >= BOOST_CLAIM_DUST_YOCTO);

  return (
    <>
      <div className="portfolio-identity-gestures">
        {!marksReady ? (
          <span
            className="standing-row-shimmer portfolio-identity-gesture-shimmer"
            role="status"
            aria-label="Loading payouts"
          />
        ) : (
          <div
            className="portfolio-identity-gesture-row"
            role="group"
            aria-label="Payouts, listings, and messages"
          >
            {showListings ? (
              <PortfolioListingActionsMark
                count={listingActions.length}
                onOpen={() => setListingsOpen(true)}
              />
            ) : null}

            {showListings && (showSupport || showSales) ? (
              <span className="portfolio-identity-gesture-sep" aria-hidden>
                ·
              </span>
            ) : null}

            {showSupport ? (
              <button
                type="button"
                className="portfolio-identity-gesture portfolio-identity-gesture--payout group"
                onClick={() => setSupportOpen(true)}
                aria-label={`${supportLabel} SOCIAL ready to collect`}
              >
                <span
                  className="signal-group signal-group-reputation"
                  aria-hidden
                >
                  <span className="portfolio-payout-mark-icon portfolio-payout-mark-icon--nudge">
                    <GiftFillIcon className="portfolio-payout-mark-svg" />
                  </span>
                </span>
                <span className="portfolio-payout-mark-amount">
                  {supportLabel}
                </span>
              </button>
            ) : null}

            {showSupport && showSales ? (
              <span className="portfolio-identity-gesture-sep" aria-hidden>
                ·
              </span>
            ) : null}

            {showSales ? (
              <button
                type="button"
                className="portfolio-identity-gesture portfolio-identity-gesture--payout group"
                onClick={() => setSalesOpen(true)}
                aria-label={`${salesLabel} NEAR from scarce sales`}
              >
                <span className="signal-group signal-group-endorse" aria-hidden>
                  <span className="portfolio-payout-mark-icon portfolio-payout-mark-icon--shop">
                    <ShopFillIcon className="portfolio-payout-mark-svg" />
                  </span>
                </span>
                <span className="portfolio-payout-mark-amount">
                  {salesLabel}
                </span>
              </button>
            ) : null}

            {showListings || showSupport || showSales ? (
              <span className="portfolio-identity-gesture-sep" aria-hidden>
                ·
              </span>
            ) : null}

            <button
              type="button"
              className="portfolio-identity-gesture portfolio-identity-gesture--payout group"
              onClick={() => setBoostOpen(true)}
              aria-label={
                boost.hasPosition
                  ? `${boostLabel} SOCIAL boosting — manage`
                  : 'Boost — lock SOCIAL to grow influence'
              }
            >
              <span className="signal-group signal-group-standing" aria-hidden>
                <span
                  className={`portfolio-payout-mark-icon portfolio-payout-mark-icon--boost${
                    boostActionable ? ' portfolio-payout-mark-icon--nudge' : ''
                  }`}
                >
                  <FireFillIcon className="portfolio-payout-mark-svg" />
                </span>
              </span>
              {boostLabel ? (
                <span className="portfolio-payout-mark-amount">
                  {boostLabel}
                </span>
              ) : null}
            </button>

            {rally.mark.visible ? (
              <>
                <span className="portfolio-identity-gesture-sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="portfolio-identity-gesture portfolio-identity-gesture--payout group"
                  onClick={() => rally.openRallySheet()}
                  aria-label={rally.mark.ariaLabel}
                >
                  <span
                    className="signal-group signal-group-standing"
                    aria-hidden
                  >
                    <span
                      className={`portfolio-payout-mark-icon portfolio-payout-mark-icon--rally${
                        rally.mark.nudge
                          ? ' portfolio-payout-mark-icon--nudge'
                          : ''
                      }`}
                    >
                      <StarsCFillIcon className="portfolio-payout-mark-svg" />
                    </span>
                  </span>
                  {rally.mark.label ? (
                    <span className="portfolio-payout-mark-amount">
                      {rally.mark.label}
                    </span>
                  ) : null}
                </button>
              </>
            ) : null}

            <span className="portfolio-identity-gesture-sep" aria-hidden>
              ·
            </span>

            <button
              type="button"
              className="portfolio-identity-gesture portfolio-identity-gesture--payout group"
              onClick={() => router.push(messagesPath())}
              aria-label={
                dmUnread > 0
                  ? dmUnread === 1
                    ? '1 unread message'
                    : `${dmUnread} unread messages`
                  : 'Messages'
              }
            >
              <span className="signal-group signal-group-standing" aria-hidden>
                <span
                  className={`portfolio-payout-mark-icon portfolio-payout-mark-icon--messages${
                    dmUnread > 0 ? ' portfolio-payout-mark-icon--nudge' : ''
                  }`}
                >
                  <MessageFillIcon className="portfolio-payout-mark-svg" />
                </span>
              </span>
              {dmUnread > 0 ? (
                <span className="portfolio-payout-mark-amount">
                  {dmUnread > 9 ? '9+' : dmUnread}
                </span>
              ) : null}
            </button>
          </div>
        )}
      </div>

      {showListings ? (
        <PortfolioListingActionsSheet
          open={listingsOpen}
          accountId={accountId}
          initialItems={listingActions}
          initialFetchedAt={listingsFetchedAt}
          onOpenChange={setListingsOpen}
          onActionsChanged={() => {
            void refreshListingActions();
          }}
        />
      ) : null}

      {showSupport ? (
        <PortfolioSupportCollectInfoSheet
          open={supportOpen}
          accountId={accountId}
          claimableLabel={supportLabel}
          collectPending={collectPending}
          onCollect={() => void handleCollect()}
          onOpenChange={setSupportOpen}
        />
      ) : null}

      {showSales ? (
        <PortfolioScarceEarningsSheet
          open={salesOpen}
          accountId={accountId}
          totalLabel={salesLabel}
          initialItems={salesItems}
          initialFetchedAt={salesFetchedAt}
          onOpenChange={setSalesOpen}
        />
      ) : null}

      <PortfolioBoostSheet
        open={boostOpen}
        accountId={accountId}
        position={boost}
        onOpenChange={handleBoostOpenChange}
      />
    </>
  );
}
