import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  WELCOME_NEAR_ENABLED,
  WELCOME_NEAR_THRESHOLD_YOCTO,
} from '@/lib/portal-config';
import { viewAccount } from '@/lib/near-rpc';

const BALANCE_POLL_DELAYS_MS = [500, 1_000, 2_000, 3_000, 5_000] as const;

interface WelcomeNearChallengeResponse {
  success?: boolean;
  enabled?: boolean;
  challenge?: {
    message: string;
    recipient: string;
    nonce: string;
  };
  error?: string;
}

interface WelcomeNearResponse {
  success?: boolean;
  dripped?: boolean;
  enabled?: boolean;
  sufficient_balance?: boolean;
  already_received?: boolean;
  amount_yocto?: string;
  tx_hash?: string;
  error?: string;
  detail?: string;
}

function decodeBase64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function getSpendableBalanceYocto(
  account: NonNullable<Awaited<ReturnType<typeof viewAccount>>>
): bigint {
  return BigInt(account.amount || '0') - BigInt(account.locked || '0');
}

async function hasSufficientWelcomeBalance(
  accountId: string
): Promise<boolean> {
  const account = await viewAccount(accountId);
  if (!account) {
    return false;
  }

  return getSpendableBalanceYocto(account) >= BigInt(WELCOME_NEAR_THRESHOLD_YOCTO);
}

async function waitForWelcomeBalance(accountId: string): Promise<boolean> {
  for (const delayMs of BALANCE_POLL_DELAYS_MS) {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (await hasSufficientWelcomeBalance(accountId)) {
      return true;
    }
  }
  return hasSufficientWelcomeBalance(accountId);
}

async function getVerifiedSignerId(
  wallet: NearWalletBase,
  accountId: string
): Promise<string> {
  const accounts = await wallet.getAccounts({ network: ACTIVE_NEAR_NETWORK });
  const accountIds = accounts.map((account) => account.accountId);

  if (!accountIds.includes(accountId)) {
    throw new Error(
      `Wallet account mismatch. Portal is connected as ${accountId}, but the wallet is using ${accountIds.join(', ') || 'no account'}. Switch the wallet account or reconnect before signing.`
    );
  }

  return accountId;
}

/**
 * Ensure the connected wallet has enough NEAR for session bootstrap gas.
 * Requests a one-time welcome drip when balance is below the deployment threshold.
 */
export async function ensureWelcomeNear(
  wallet: NearWalletBase,
  accountId: string
): Promise<void> {
  if (!WELCOME_NEAR_ENABLED) {
    return;
  }

  if (await hasSufficientWelcomeBalance(accountId)) {
    return;
  }

  if (typeof wallet.signMessage !== 'function') {
    throw new Error(
      'Your wallet does not support message signing, which is required to receive welcome NEAR for session setup.'
    );
  }

  await getVerifiedSignerId(wallet, accountId);

  const challengeRes = await fetch('/api/onboarding/welcome-near/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId }),
  });
  const challengeData =
    (await challengeRes.json()) as WelcomeNearChallengeResponse;

  if (!challengeRes.ok) {
    throw new Error(challengeData.error ?? 'Failed to prepare welcome NEAR');
  }

  if (challengeData.enabled === false) {
    return;
  }

  if (!challengeData.challenge) {
    throw new Error('Welcome NEAR challenge missing from backend response');
  }

  const signed = await wallet.signMessage({
    network: ACTIVE_NEAR_NETWORK,
    signerId: accountId,
    message: challengeData.challenge.message,
    recipient: challengeData.challenge.recipient,
    nonce: decodeBase64ToBytes(challengeData.challenge.nonce),
  });

  const dripRes = await fetch('/api/onboarding/welcome-near', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_id: signed.accountId,
      public_key: signed.publicKey,
      signature: signed.signature,
      message: challengeData.challenge.message,
    }),
  });
  const dripData = (await dripRes.json()) as WelcomeNearResponse;

  if (!dripRes.ok || dripData.success === false) {
    throw new Error(
      dripData.error ?? dripData.detail ?? 'Welcome NEAR request failed'
    );
  }

  if (
    dripData.sufficient_balance ||
    dripData.already_received ||
    !dripData.dripped
  ) {
    if (!(await hasSufficientWelcomeBalance(accountId))) {
      throw new Error(
        'Your wallet still needs a small amount of NEAR to authorize OnSocial. Add a little NEAR and try again.'
      );
    }
    return;
  }

  const funded = await waitForWelcomeBalance(accountId);
  if (!funded) {
    throw new Error(
      'Welcome NEAR was sent but has not arrived yet. Wait a few seconds and try again.'
    );
  }
}
