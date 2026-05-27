import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { normalizeEndorsementTopic } from '@onsocial/sdk';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const RETRY_DELAYS_MS = [0, 1200, 2400, 3600];

const REWARD_ACTIONS = new Set([
  'profile_created',
  'daily_active',
  'stand_given',
  'mutual_stand_created',
  'endorsement_given',
]);

interface RewardActionRequest {
  account_id?: unknown;
  action?: unknown;
  target_account_id?: unknown;
  topic?: unknown;
  proof?: unknown;
  auth?: unknown;
}

function getRewardsApiKey(): string | undefined {
  const key = process.env.ONSOCIAL_PORTAL_REWARDS_API_KEY?.trim();
  return key || undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

function normalizeTopic(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return normalizeEndorsementTopic(value);
}

function hasOnChainProof(proof: unknown): boolean {
  if (!proof || typeof proof !== 'object') return false;
  const txHash = (proof as { txHash?: unknown }).txHash;
  return typeof txHash === 'string' && txHash.trim().length > 0;
}

function hasAuthShape(value: unknown): boolean {
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

async function verifyWithRetry(check: () => Promise<boolean>): Promise<boolean> {
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);
    if (await check()) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  const apiKey = getRewardsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'Portal rewards API key is not configured' },
      { status: 503 }
    );
  }

  let body: RewardActionRequest;
  try {
    body = (await request.json()) as RewardActionRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const accountId = normalizeAccountId(body.account_id);
  const targetAccountId = normalizeAccountId(body.target_account_id);
  const topic = normalizeTopic(body.topic);

  if (!accountId || !REWARD_ACTIONS.has(action)) {
    return NextResponse.json(
      { success: false, error: 'Invalid reward action request' },
      { status: 400 }
    );
  }
  if (
    (action === 'stand_given' ||
      action === 'mutual_stand_created' ||
      action === 'endorsement_given') &&
    !targetAccountId
  ) {
    return NextResponse.json(
      { success: false, error: 'target_account_id is required' },
      { status: 400 }
    );
  }
  if (targetAccountId && targetAccountId === accountId) {
    return NextResponse.json(
      { success: false, error: 'Self rewards are not allowed' },
      { status: 400 }
    );
  }
  if (!hasAuthShape(body.auth)) {
    return NextResponse.json(
      { success: false, error: 'Reward signature is required' },
      { status: 401 }
    );
  }

  try {
    const os = createPortalServerOnSocialClient();
    const eligible = await verifyWithRetry(async () => {
      if (action === 'daily_active') {
        return hasOnChainProof(body.proof);
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

    if (!eligible) {
      return NextResponse.json({
        success: true,
        credited: false,
        eligible: false,
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Reward eligibility check failed',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }

  try {
    const response = await fetch(`${ACTIVE_BACKEND_URL}/v1/portal/reward-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      cache: 'no-store',
      body: JSON.stringify({
        account_id: accountId,
        action,
        target_account_id: targetAccountId,
        topic,
        proof: body.proof ?? {},
        auth: body.auth,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as unknown;
    if (
      process.env.NODE_ENV === 'development' &&
      response.status === 401 &&
      typeof data === 'object' &&
      data !== null &&
      (data as { error?: string }).error === 'Invalid API key'
    ) {
      console.warn('[rewards/action] backend rejected portal rewards API key', {
        backendUrl: ACTIVE_BACKEND_URL,
        keyPrefix: `${apiKey.slice(0, 12)}…`,
      });
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Reward credit request failed',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}
