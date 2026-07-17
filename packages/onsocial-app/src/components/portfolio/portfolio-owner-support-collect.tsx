'use client';

import { useCallback, useEffect, useState } from 'react';
import { GiftIcon, InformationCircleFillIcon, PulsingDots } from '@onsocial/ui';
import { PortfolioSupportCollectInfoSheet } from '@/components/portfolio/portfolio-support-collect-info-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { APP_COLLECT_ACTION_LABEL } from '@/lib/app-reward-constants';
import { refreshAppSocialBalanceAfterClaim } from '@/lib/app-social-balance-sync';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PortfolioOwnerSupportCollectProps {
  accountId: string;
}

/**
 * Owner-only face line — green gift mark · amount · Collect · info.
 * Claims the shared social-spend target pot (profile support, endorsement
 * support, and boost-post author share).
 */
export function PortfolioOwnerSupportCollect({
  accountId,
}: PortfolioOwnerSupportCollectProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [claimableYocto, setClaimableYocto] = useState<bigint | null>(null);
  const [pending, setPending] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

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

  useEffect(() => {
    void refreshSupport({ fresh: true });
  }, [refreshSupport]);

  async function handleCollect() {
    if (pending || !claimableYocto || claimableYocto <= 0n) return;

    setPending(true);
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
      setPending(false);
    }
  }

  if (claimableYocto == null || claimableYocto <= 0n) {
    return null;
  }

  const amountLabel = formatSocialCompact(claimableYocto.toString());

  return (
    <>
      <div className="portfolio-identity-gestures">
        <div
          className="portfolio-identity-gesture-row"
          role="group"
          aria-label="Received support"
        >
          <button
            type="button"
            className="portfolio-identity-gesture portfolio-identity-gesture--collect group"
            disabled={pending}
            onClick={() => void handleCollect()}
            aria-label={`Collect ${amountLabel} SOCIAL support`}
            aria-busy={pending || undefined}
          >
            <span className="portfolio-identity-gesture-gift-mark" aria-hidden>
              <GiftIcon className="portfolio-identity-gesture-gift" />
            </span>
            <span className="portfolio-identity-gesture-amount">
              {amountLabel} SOCIAL
            </span>
            <span className="portfolio-identity-gesture-mid" aria-hidden>
              ·
            </span>
            {pending ? (
              <PulsingDots
                size="sm"
                label="Collecting support"
                className="portfolio-identity-gesture-collect-dots"
              />
            ) : (
              <span className="portfolio-identity-gesture-collect-label">
                {APP_COLLECT_ACTION_LABEL}
              </span>
            )}
          </button>
          <button
            type="button"
            className="portfolio-support-collect-info-button"
            aria-label="What's in this support pot?"
            onClick={() => setInfoOpen(true)}
          >
            <InformationCircleFillIcon
              className="portfolio-support-collect-info-icon"
              aria-hidden
            />
          </button>
        </div>
      </div>
      <PortfolioSupportCollectInfoSheet
        open={infoOpen}
        accountId={accountId}
        claimableLabel={amountLabel}
        onOpenChange={setInfoOpen}
      />
    </>
  );
}
