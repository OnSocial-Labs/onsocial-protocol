'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  OsAppChromePage,
  OsAppChromePageStatus,
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useCommunityAppCatalog } from '@/hooks/use-community-app-catalog';
import { grantCommunityAppSession } from '@/lib/community-app-session-grant';
import { ensureAppGatewayAuth } from '@/lib/app-gateway-auth';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  requestCommunityAppHandoff,
  resolveCommunityLaunchHref,
} from '@/lib/community-app-handoff';
import {
  parseCommunityOsHandoffAppId,
  parseCommunityOsHandoffPublicKey,
} from '@/lib/community-os-handoff';
import {
  txToastConfirming,
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function CommunityHandoffPanel() {
  const searchParams = useSearchParams();
  const appId = parseCommunityOsHandoffAppId(searchParams.get('app'));
  const publicKey = parseCommunityOsHandoffPublicKey(searchParams.get('pk'));
  const listings = useCommunityAppCatalog(Boolean(appId));
  const listing = listings?.find((app) => app.appId === appId);
  const label = listing?.name?.trim() || appId;
  const { accountId, isConnected, connect, isLoading } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueToApp = useCallback(async () => {
    if (!appId) return;
    setPending(true);
    setError(null);
    try {
      const { wallet, session, accountId: viewer } = await getClient();
      if (publicKey) {
        const grant = await grantCommunityAppSession({
          accountId: viewer,
          appId,
          publicKey,
          wallet,
        });
        if (!grant.skipped && grant.txHashes.length > 0) {
          const confirmed = await trackTransaction({
            txHashes: grant.txHashes,
            submittedMessage: txToastConfirming.grantingCommunityApp,
            successMessage: txToastSuccess.communityAppGranted,
            failureMessage: txToastError.communityAppGrantFailed,
          });
          if (!confirmed) return;
        }
      }
      const token = await ensureAppGatewayAuth({
        accountId: viewer,
        wallet,
        session,
      });
      const handoff = await requestCommunityAppHandoff(appId, token);
      if (!handoff) {
        setError('This app is not listed on the Community board.');
        return;
      }
      window.location.replace(
        resolveCommunityLaunchHref({
          href: handoff.href,
          appId,
          handoff,
        })
      );
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message =
        err instanceof Error
          ? err.message
          : txToastError.communityAppGrantFailed;
      setError(message);
      setTxResult({ type: 'error', msg: message });
    } finally {
      setPending(false);
    }
  }, [appId, getClient, publicKey, setTxResult, trackTransaction]);

  return (
    <OsAppScreen title="Continue" backFallbackHref={APP_HOME_PATH} glassChrome>
      <OsAppChromePage>
        {!appId ? (
          <OsAppChromePageStatus>
            Missing app. Open this page from a listed Community dapp.
          </OsAppChromePageStatus>
        ) : !isConnected && !isLoading ? (
          <>
            <OsAppChromePageStatus>
              Continue to {label} with your OnSocial account.
            </OsAppChromePageStatus>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction onClick={() => void connect()}>
                Connect
              </OsSheetAction>
            </OsSheetActions>
          </>
        ) : (
          <>
            <OsAppChromePageStatus>
              {publicKey
                ? `Allow ${label} to write as ${accountId ?? 'you'}.`
                : `Return to ${label}${accountId ? ` as ${accountId}` : ''}.`}
            </OsAppChromePageStatus>
            {error ? (
              <OsAppChromePageStatus error role="alert">
                {error}
              </OsAppChromePageStatus>
            ) : null}
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                pending={pending || isLoading}
                pendingLabel={
                  publicKey
                    ? txToastPending.grantingCommunityApp
                    : 'Continuing…'
                }
                disabled={pending || isLoading}
                onClick={() => void continueToApp()}
              >
                Continue
              </OsSheetAction>
            </OsSheetActions>
          </>
        )}
      </OsAppChromePage>
    </OsAppScreen>
  );
}
