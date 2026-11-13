'use client';

import { useCallback, useState } from 'react';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  clearAppSocialSession,
  grantAppSocialSession,
  renewAppSocialSession,
  type AppSocialSessionLifecycle,
} from '@/lib/app-social-session';
import {
  sessionPendingFeedback,
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import {
  accountNeedsAppSessionSponsor,
  fundAppSessionIfNeeded,
} from '@/lib/welcome-near';
import { mapAppAccessError } from '@/lib/wallet-errors';

/** Shared Allow / Renew path for the wallet banner and the App access sheet. */
export function useAppAccessGrant(
  lifecycle: AppSocialSessionLifecycle,
  onSettled?: () => void | Promise<void>
) {
  const {
    isBootstrappingSession,
    resumeSocialSession,
    clearSocialSessionLocal,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [pending, setPending] = useState(false);

  const allowOrRenew = useCallback(async () => {
    if (pending || isBootstrappingSession) return;
    const renewing = lifecycle === 'expired';
    try {
      const { wallet, accountId: signerId } = await getSigningWallet();
      if (await accountNeedsAppSessionSponsor(signerId)) {
        setTxResult(sessionPendingFeedback('setup'));
        await fundAppSessionIfNeeded(signerId);
      }
      setPending(true);
      setTxResult(sessionPendingFeedback('wallet'));
      const result = renewing
        ? await renewAppSocialSession({
            accountId: signerId,
            wallet,
          })
        : await grantAppSocialSession({
            accountId: signerId,
            wallet,
          });

      if (!result.ready) {
        setTxResult({
          type: 'error',
          msg: txToastError.allowAppAccessFailed,
        });
        return;
      }

      if (result.txHashes.length === 0) {
        setTxResult({
          type: 'success',
          msg: renewing
            ? txToastSuccess.appAccessRenewed
            : txToastSuccess.appAccessAllowed,
        });
        await resumeSocialSession({
          renewIfExpired: false,
          bootstrapIfMissing: false,
        });
        await onSettled?.();
        return;
      }

      setTxResult(sessionPendingFeedback('confirming'));
      const confirmed = await trackTransaction({
        txHashes: result.txHashes,
        submittedMessage: renewing
          ? txToastConfirming.renewingAppAccess
          : txToastConfirming.allowingAppAccess,
        successMessage: renewing
          ? txToastSuccess.appAccessRenewed
          : txToastSuccess.appAccessAllowed,
        failureMessage: txToastError.allowAppAccessFailed,
      });
      if (!confirmed) {
        await clearAppSocialSession(signerId);
        clearSocialSessionLocal();
        await onSettled?.();
        return;
      }

      await resumeSocialSession({
        renewIfExpired: false,
        bootstrapIfMissing: false,
      });
      await onSettled?.();
    } catch (error) {
      const msg = mapAppAccessError(error, txToastError.allowAppAccessFailed);
      if (!msg) {
        setTxResult(null);
        return;
      }
      setTxResult({ type: 'error', msg });
    } finally {
      setPending(false);
    }
  }, [
    clearSocialSessionLocal,
    getSigningWallet,
    isBootstrappingSession,
    lifecycle,
    onSettled,
    pending,
    resumeSocialSession,
    setTxResult,
    trackTransaction,
  ]);

  return { pending, allowOrRenew };
}
