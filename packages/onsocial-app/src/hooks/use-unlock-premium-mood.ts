'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ONPAGE_SOCIAL_SPEND_APP_ID,
  PAGE_MOOD_CATALOG,
  premiumMoodPriceYocto,
  type PremiumPageMoodId,
} from '@onsocial/sdk';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function extractTxHash(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.txHash === 'string') return obj.txHash;
  if (typeof obj.hash === 'string') return obj.hash;

  const transaction = obj.transaction;
  if (transaction && typeof transaction === 'object') {
    const hash = (transaction as Record<string, unknown>).hash;
    if (typeof hash === 'string') return hash;
  }

  const raw = obj.raw;
  if (raw && raw !== value) return extractTxHash(raw);

  return undefined;
}

function formatUnlockError(
  error: unknown,
  priceSocial?: string
): string {
  if (!(error instanceof Error)) {
    return 'Could not unlock mood.';
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  if (
    priceSocial &&
    /doesn't have enough balance|not enough balance/i.test(message)
  ) {
    return `Not enough SOCIAL in your wallet. This unlock costs ${priceSocial} SOCIAL.`;
  }

  return message;
}

export function useUnlockPremiumMood(pageAccountId: string) {
  const router = useRouter();
  const {
    accountId,
    isConnected,
    isLoading,
    isBootstrappingSession,
    connect,
    getSigningWallet,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner =
    isConnected && Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);
  const needsConnect = !isLoading && !isConnected;

  const unlockMood = useCallback(
    async (moodId: PremiumPageMoodId): Promise<boolean> => {
      setError(null);
      setIsUnlocking(true);

      let priceSocial: string | undefined;

      try {
        const catalogEntry = PAGE_MOOD_CATALOG[moodId];
        priceSocial = catalogEntry?.priceSocial;
        if (!priceSocial) {
          throw new Error('This mood is not available for purchase.');
        }

        const { wallet, accountId: signingAccountId } = await getSigningWallet();

        if (!accountIdsEqual(signingAccountId, pageAccountId)) {
          throw new Error(
            `Connect as @${pageAccountId} to unlock moods for this page.`
          );
        }

        const { client } = await getClient();
        const amount = premiumMoodPriceYocto(priceSocial);
        const amountYocto = BigInt(amount);

        const balanceYocto = BigInt(
          await client.token.balanceOf(signingAccountId)
        );
        if (balanceYocto < amountYocto) {
          throw new Error(
            `Not enough SOCIAL in your wallet. This unlock costs ${priceSocial} SOCIAL.`
          );
        }

        const payload = client.socialSpend.buildUnlockPageMoodTransaction(
          moodId,
          amount,
          {
            appId: ONPAGE_SOCIAL_SPEND_APP_ID,
            pageAccountId: signingAccountId,
          }
        );

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

        const purchaseTxHash = extractTxHash(payment);

        await client.pages.unlockMood(moodId, {
          accountId: signingAccountId,
          purchaseTxHash,
          wait: true,
        });

        router.refresh();
        return true;
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return false;
        }
        setError(formatUnlockError(err, priceSocial));
        return false;
      } finally {
        setIsUnlocking(false);
      }
    },
    [getClient, getSigningWallet, pageAccountId, router]
  );

  return {
    unlockMood,
    connect,
    error,
    isUnlocking: isUnlocking || isBootstrappingSession,
    isOwner,
    needsConnect,
    walletAccountId: accountId,
  };
}
