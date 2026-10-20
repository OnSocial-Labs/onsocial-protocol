import { viewAccount } from '@/lib/app-near-rpc';
import {
  accountNeedsSessionSponsor,
  chooseSessionKeyAllowanceYocto,
  WELCOME_NEAR_THRESHOLD_YOCTO,
} from '@/lib/app-session-sponsor';

const BALANCE_POLL_DELAYS_MS = [500, 1_000, 2_000, 3_000, 5_000] as const;
const REQUEST_TIMEOUT_MS = 30_000;

const SESSION_SETUP_FAILED =
  'Session setup did not finish. Try connecting again.';

interface WelcomeNearResponse {
  success?: boolean;
  dripped?: boolean;
  enabled?: boolean;
  sufficient_balance?: boolean;
  error?: string;
  detail?: string;
}

export async function readLiquidYocto(
  accountId: string
): Promise<bigint | null> {
  const account = await viewAccount(accountId);
  if (!account) return null;
  return BigInt(account.amount || '0') - BigInt(account.locked || '0');
}

export async function accountNeedsAppSessionSponsor(
  accountId: string
): Promise<boolean> {
  try {
    return accountNeedsSessionSponsor(await readLiquidYocto(accountId));
  } catch {
    return true;
  }
}

async function waitForSponsorBalance(accountId: string): Promise<boolean> {
  for (const delayMs of BALANCE_POLL_DELAYS_MS) {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const liquid = await readLiquidYocto(accountId).catch(() => null);
    if (liquid != null && liquid >= WELCOME_NEAR_THRESHOLD_YOCTO) {
      return true;
    }
  }
  const liquid = await readLiquidYocto(accountId).catch(() => null);
  return liquid != null && liquid >= WELCOME_NEAR_THRESHOLD_YOCTO;
}

/** Sponsor just enough NEAR for the session key. No-op when the balance is already there. */
export async function fundAppSessionIfNeeded(accountId: string): Promise<void> {
  if (!(await accountNeedsAppSessionSponsor(accountId))) return;

  let data: WelcomeNearResponse;
  try {
    const response = await fetch('/api/onboarding/welcome-near', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({ account_id: accountId }),
    });
    data = (await response.json()) as WelcomeNearResponse;
    if (!response.ok || data.success === false) {
      throw new Error(data.error ?? data.detail ?? SESSION_SETUP_FAILED);
    }
  } catch (error) {
    console.warn('App session sponsor failed', error);
    throw new Error(SESSION_SETUP_FAILED);
  }

  if (data.enabled === false || data.sufficient_balance || !data.dripped) {
    return;
  }

  const funded = await waitForSponsorBalance(accountId);
  if (!funded) {
    throw new Error(SESSION_SETUP_FAILED);
  }
}

export async function resolveAppSessionKeyAllowanceYocto(
  accountId: string
): Promise<string> {
  const liquid = await readLiquidYocto(accountId).catch(() => null);
  return chooseSessionKeyAllowanceYocto(liquid);
}
