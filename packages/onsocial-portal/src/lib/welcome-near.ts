import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  WELCOME_NEAR_ENABLED,
  WELCOME_NEAR_THRESHOLD_YOCTO,
} from '@/lib/portal-config';
import { viewAccount } from '@/lib/near-rpc';

const BALANCE_POLL_DELAYS_MS = [500, 1_000, 2_000, 3_000, 5_000] as const;
const REQUEST_TIMEOUT_MS = 30_000;

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

function getSpendableBalanceYocto(
  account: NonNullable<Awaited<ReturnType<typeof viewAccount>>>
): bigint {
  return BigInt(account.amount || '0') - BigInt(account.locked || '0');
}

export async function accountHasSufficientWelcomeBalance(
  accountId: string
): Promise<boolean> {
  const account = await viewAccount(accountId);
  if (!account) {
    return false;
  }

  return (
    getSpendableBalanceYocto(account) >= BigInt(WELCOME_NEAR_THRESHOLD_YOCTO)
  );
}

async function hasSufficientWelcomeBalance(
  accountId: string
): Promise<boolean> {
  return accountHasSufficientWelcomeBalance(accountId);
}

/** True when welcome drip may be needed before session key AddKey. */
export async function accountNeedsWelcomeNearFunding(
  accountId: string
): Promise<boolean> {
  if (!WELCOME_NEAR_ENABLED) return false;
  return !(await accountHasSufficientWelcomeBalance(accountId));
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

export async function assertWalletAccount(
  wallet: NearWalletBase,
  accountId: string
): Promise<void> {
  const accounts = await wallet.getAccounts({ network: ACTIVE_NEAR_NETWORK });
  const accountIds = accounts.map((account) => account.accountId);

  if (!accountIds.includes(accountId)) {
    throw new Error(
      `Wallet account mismatch. Portal is connected as ${accountId}, but the wallet is using ${accountIds.join(', ') || 'no account'}. Switch the wallet account or reconnect before signing.`
    );
  }
}

/** Request welcome NEAR only when balance is below the AddKey threshold. */
export async function requestWelcomeNearIfNeeded(
  accountId: string
): Promise<void> {
  if (!(await accountNeedsWelcomeNearFunding(accountId))) {
    return;
  }
  await requestWelcomeNearForAccount(accountId);
}

/**
 * Request a welcome NEAR drip for an account (no wallet connected yet).
 * Used before reconnect when we already know the account id and will add a key.
 */
export async function requestWelcomeNearForAccount(
  accountId: string
): Promise<void> {
  if (!WELCOME_NEAR_ENABLED) {
    return;
  }

  if (await accountHasSufficientWelcomeBalance(accountId)) {
    return;
  }

  const dripRes = await fetch('/api/onboarding/welcome-near', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({ account_id: accountId }),
  });
  const dripData = (await dripRes.json()) as WelcomeNearResponse;

  if (!dripRes.ok || dripData.success === false) {
    throw new Error(
      dripData.error ?? dripData.detail ?? 'Welcome NEAR request failed'
    );
  }

  if (dripData.sufficient_balance || !dripData.dripped) {
    return;
  }

  await waitForWelcomeBalance(accountId);
}

/**
 * Ensure the connected wallet has enough NEAR for session key AddKey tx fee.
 * Requests a one-time welcome drip from the portal backend when balance is low.
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

  await assertWalletAccount(wallet, accountId);

  const dripRes = await fetch('/api/onboarding/welcome-near', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({ account_id: accountId }),
  });
  const dripData = (await dripRes.json()) as WelcomeNearResponse;

  if (!dripRes.ok || dripData.success === false) {
    throw new Error(
      dripData.error ?? dripData.detail ?? 'Welcome NEAR request failed'
    );
  }

  if (dripData.sufficient_balance || !dripData.dripped) {
    if (!(await hasSufficientWelcomeBalance(accountId))) {
      throw new Error(
        'Your wallet needs a little NEAR to add your session key. Add about 0.013 NEAR or wait a moment and try again.'
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
