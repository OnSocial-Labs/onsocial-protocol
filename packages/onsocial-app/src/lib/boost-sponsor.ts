import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  RelayExecutionError,
  isBoostSponsorLimitError,
  type OnSocial,
} from '@onsocial/sdk';
import {
  bootstrapSession,
  localStorageKeyStore,
  nearConnectAdapter,
  restoreSession,
  type BoostLockPeriod,
  type Session,
} from '@onsocial/sdk/advanced';
import { BOOST_LOCK_GAS } from '@/features/boost/boost-position';
import { ACTIVE_NEAR_NETWORK, SOCIAL_TOKEN_CONTRACT } from '@/lib/app-config';
import { readE2eMockSignerEnabled } from '@/lib/e2e-mock-signer';
import { viewFunctionCallAccessKey } from '@/lib/near-access-key';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { fundAppSessionIfNeeded } from '@/lib/welcome-near';

/** Allowance locked on the token key. Covers the 1 yocto confirmation, not the fee. */
export const BOOST_SPONSOR_SESSION_ALLOWANCE_YOCTO = '1000000000000000000000';

const SESSION_STORE_PREFIX = 'onsocial.app.boost-sponsor.';

export type BoostSponsorAttempt =
  | { kind: 'sponsored'; txHash: string }
  | { kind: 'fallback'; limited: boolean }
  | { kind: 'cancelled' }
  | { kind: 'reverted' };

export function classifyBoostSponsorFailure(
  error: unknown
): 'limited' | 'cancelled' | 'reverted' | 'unavailable' {
  if (isWalletUserCancellation(error)) return 'cancelled';
  if (isBoostSponsorLimit(error)) return 'limited';
  if (isRelayRevert(error)) return 'reverted';
  return 'unavailable';
}

function isBoostSponsorLimit(error: unknown): boolean {
  if (isBoostSponsorLimitError(error)) return true;
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === 'BOOST_SPONSOR_LIMIT' ||
    record.message === 'BOOST_SPONSOR_LIMIT'
  );
}

function isRelayRevert(error: unknown): boolean {
  if (error instanceof RelayExecutionError) return true;
  if (!error || typeof error !== 'object') return false;
  const record = error as { name?: unknown; txHash?: unknown };
  return (
    record.name === 'RelayExecutionError' && typeof record.txHash === 'string'
  );
}

function relayTxHash(value: { txHash?: string; tx_hash?: unknown }): string {
  if (typeof value.txHash === 'string' && value.txHash.trim()) {
    return value.txHash.trim();
  }
  if (typeof value.tx_hash === 'string' && value.tx_hash.trim()) {
    return value.tx_hash.trim();
  }
  return '';
}

/**
 * Sponsor a boost lock when a token session key is available.
 * The Playwright mock signer is not eligible, so it falls straight through
 * to the wallet the sheet already uses.
 */
export async function sponsorBoostLock(input: {
  client: OnSocial;
  wallet: NearWalletBase;
  accountId: string;
  amountYocto: string;
  months: BoostLockPeriod;
}): Promise<BoostSponsorAttempt> {
  if (readE2eMockSignerEnabled()) {
    return { kind: 'fallback', limited: false };
  }

  let session: Session | null;
  try {
    session = await ensureBoostSponsorSession(input.accountId, input.wallet);
  } catch (error) {
    if (classifyBoostSponsorFailure(error) === 'cancelled') {
      return { kind: 'cancelled' };
    }
    return { kind: 'fallback', limited: false };
  }
  if (!session) return { kind: 'fallback', limited: false };

  try {
    const relayed = await input.client.boost.commitLock({
      session,
      amountYocto: input.amountYocto,
      months: input.months,
      gas: BOOST_LOCK_GAS,
    });
    const txHash = relayTxHash(relayed);
    if (!txHash) return { kind: 'reverted' };
    return { kind: 'sponsored', txHash };
  } catch (error) {
    const kind = classifyBoostSponsorFailure(error);
    if (kind === 'cancelled') return { kind: 'cancelled' };
    if (kind === 'reverted') return { kind: 'reverted' };
    return { kind: 'fallback', limited: kind === 'limited' };
  }
}

async function ensureBoostSponsorSession(
  accountId: string,
  wallet: NearWalletBase
): Promise<Session> {
  const store = localStorageKeyStore(SESSION_STORE_PREFIX);
  const restored = await restoreSession({
    store,
    accountId,
    contract: 'token',
  });
  if (restored && (await tokenKeyStillOnChain(accountId, restored))) {
    return restored;
  }

  await fundAppSessionIfNeeded(accountId);
  return bootstrapSession({
    wallet: nearConnectAdapter(wallet, accountId, {
      network: ACTIVE_NEAR_NETWORK,
    }),
    accountId,
    network: ACTIVE_NEAR_NETWORK,
    contract: 'token',
    functionCallKey: {
      methodNames: ['ft_transfer_call'],
      allowanceYocto: BOOST_SPONSOR_SESSION_ALLOWANCE_YOCTO,
    },
    store,
  });
}

async function tokenKeyStillOnChain(
  accountId: string,
  session: Session
): Promise<boolean> {
  const onChain = await viewFunctionCallAccessKey(
    accountId,
    session.key.publicKey
  );
  return (
    onChain?.receiverId === SOCIAL_TOKEN_CONTRACT &&
    onChain.methodNames.includes('ft_transfer_call')
  );
}
