import type { OnSocial } from './client.js';
import { normalizeEndorsementTopic } from './builders/endorsement.js';
import type { MaterialisedProfile } from './modules/profiles.js';
import {
  isPlatformRewardAction,
  type PlatformRewardAction,
} from './platform-reward-actions.js';

export const PLATFORM_REWARD_ELIGIBILITY_RETRY_MS = [
  0, 1200, 2400, 3600,
] as const;

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function normalizePlatformRewardAccountId(
  value: unknown
): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

export function normalizePlatformRewardTopic(
  value: unknown
): string | undefined {
  if (typeof value !== 'string') return undefined;
  return normalizeEndorsementTopic(value);
}

export function hasPlatformRewardOnChainProof(proof: unknown): boolean {
  if (!proof || typeof proof !== 'object') return false;
  const txHash = (proof as { txHash?: unknown }).txHash;
  return typeof txHash === 'string' && txHash.trim().length > 0;
}

export function hasPlatformRewardAuthShape(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const auth = value as Record<string, unknown>;
  return (
    typeof auth.public_key === 'string' &&
    typeof auth.signature === 'string' &&
    typeof auth.message === 'string'
  );
}

function hasProfileFields(profile: MaterialisedProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.name?.trim() ||
      profile.bio?.trim() ||
      profile.avatar ||
      profile.banner ||
      Object.keys(profile.extra).length > 0
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyWithRetry(
  check: () => Promise<boolean>,
  delaysMs: readonly number[] = PLATFORM_REWARD_ELIGIBILITY_RETRY_MS
): Promise<boolean> {
  for (const delay of delaysMs) {
    if (delay) await sleep(delay);
    if (await check()) return true;
  }
  return false;
}

export async function verifyPlatformRewardEligibility(
  os: OnSocial,
  input: {
    action: string;
    accountId: string;
    targetAccountId: string | null;
    topic?: string;
    proof: unknown;
  }
): Promise<boolean> {
  if (!isPlatformRewardAction(input.action)) {
    return false;
  }

  const action = input.action;
  const { accountId, targetAccountId, proof } = input;
  const topic = input.topic;

  return verifyWithRetry(async () => {
    if (action === 'daily_active') {
      return hasPlatformRewardOnChainProof(proof);
    }
    if (action === 'profile_created') {
      return hasProfileFields(await os.profiles.get(accountId));
    }
    if (action === 'stand_given') {
      return targetAccountId
        ? await os.standings.has(accountId, targetAccountId)
        : false;
    }
    if (action === 'mutual_stand_created') {
      return targetAccountId
        ? (await os.standings.has(accountId, targetAccountId)) &&
            (await os.standings.has(targetAccountId, accountId))
        : false;
    }
    if (action === 'endorsement_given') {
      return targetAccountId
        ? Boolean(
            await os.endorsements.get(targetAccountId, {
              issuer: accountId,
              topic,
            })
          )
        : false;
    }
    return false;
  });
}

export function platformRewardActionRequiresTarget(
  action: PlatformRewardAction
): boolean {
  return (
    action === 'stand_given' ||
    action === 'mutual_stand_created' ||
    action === 'endorsement_given'
  );
}
