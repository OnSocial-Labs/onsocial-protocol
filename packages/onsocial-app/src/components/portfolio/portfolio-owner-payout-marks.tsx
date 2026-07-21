'use client';

import { useCallback, useEffect, useState } from 'react';
import { GiftIcon, ShopFillIcon } from '@onsocial/ui';
import { PortfolioScarceEarningsSheet } from '@/components/portfolio/portfolio-scarce-earnings-sheet';
import { PortfolioSupportCollectInfoSheet } from '@/components/portfolio/portfolio-support-collect-info-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { refreshAppSocialBalanceAfterClaim } from '@/lib/app-social-balance-sync';
import { formatSocialCompact } from '@/lib/format-social-balance';
import {
  fetchScarceCreatorEarnings,
  formatEarningsNearCompact,
} from '@/lib/scarce-creator-earnings';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PortfolioOwnerPayoutMarksProps {
  accountId: string;
}

/**
 * Owner face — same gesture chrome as Stand / Endorse / Support:
 * animated mark (reputation gift / endorse shop) + quiet amount; soft wash.
 * Tap opens drawers (Collect only on support — sales already paid to wallet).
 */
export function PortfolioOwnerPayoutMarks({
  accountId,
}: PortfolioOwnerPayoutMarksProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [claimableYocto, setClaimableYocto] = useState<bigint | null>(null);
  const [salesYocto, setSalesYocto] = useState<string | null>(null);
  const [collectPending, setCollectPending] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);

  const refreshSupport = useCallback(
    async (options: { fresh?: boolean } = {}) => {
      try {
        const next = await fetchProfileSupportBalanceYocto(accountId, options);
        setClaimableYocto(next);
      } catch {
        setClaimableYocto(null);
      }
    },
    [accountId]
  );

  const refreshSales = useCallback(async () => {
    try {
      const page = await fetchScarceCreatorEarnings(accountId, { limit: 100 });
      setSalesYocto(page.totalYocto);
    } catch {
      setSalesYocto(null);
    }
  }, [accountId]);

  useEffect(() => {
    void refreshSupport({ fresh: true });
    void refreshSales();
  }, [refreshSupport, refreshSales]);

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

  if (!showSupport && !showSales) {
    return null;
  }

  const supportLabel = showSupport
    ? formatSocialCompact(claimableYocto!.toString())
    : '';
  const salesLabel = showSales ? formatEarningsNearCompact(salesYocto!) : '';

  return (
    <>
      <div className="portfolio-identity-gestures">
        <div
          className="portfolio-identity-gesture-row"
          role="group"
          aria-label="Payouts"
        >
          {showSupport ? (
            <button
              type="button"
              className="portfolio-identity-gesture portfolio-identity-gesture--payout group"
              onClick={() => setSupportOpen(true)}
              aria-label={`${supportLabel} SOCIAL ready to collect`}
            >
              <span className="signal-group signal-group-reputation" aria-hidden>
                <span className="portfolio-payout-mark-icon">
                  <GiftIcon className="portfolio-payout-mark-svg" />
                </span>
              </span>
              <span className="portfolio-payout-mark-amount">{supportLabel}</span>
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
              <span className="portfolio-payout-mark-amount">{salesLabel}</span>
            </button>
          ) : null}
        </div>
      </div>

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
          onOpenChange={setSalesOpen}
        />
      ) : null}
    </>
  );
}
