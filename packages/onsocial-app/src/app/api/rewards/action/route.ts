import { NextResponse, type NextRequest } from 'next/server';
import {
  hasPlatformRewardAuthShape,
  isPlatformRewardAction,
  normalizePlatformRewardAccountId,
  normalizePlatformRewardTopic,
  platformRewardActionRequiresTarget,
  verifyPlatformRewardEligibility,
} from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { ACTIVE_BACKEND_URL } from '@/lib/app-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function POST(request: NextRequest) {
  const apiKey = getRewardsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'Platform rewards API key is not configured' },
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
  const accountId = normalizePlatformRewardAccountId(body.account_id);
  const targetAccountId = normalizePlatformRewardAccountId(body.target_account_id);
  const topic = normalizePlatformRewardTopic(body.topic);

  if (!accountId || !isPlatformRewardAction(action)) {
    return NextResponse.json(
      { success: false, error: 'Invalid reward action request' },
      { status: 400 }
    );
  }
  if (platformRewardActionRequiresTarget(action) && !targetAccountId) {
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
  if (!hasPlatformRewardAuthShape(body.auth)) {
    return NextResponse.json(
      { success: false, error: 'Reward signature is required' },
      { status: 401 }
    );
  }

  try {
    const os = createServerOnSocialClient();
    const eligible = await verifyPlatformRewardEligibility(os, {
      action,
      accountId,
      targetAccountId,
      topic,
      proof: body.proof ?? {},
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
    const response = await fetch(
      `${ACTIVE_BACKEND_URL}/v1/portal/reward-action`,
      {
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
      }
    );

    const data = (await response.json().catch(() => ({}))) as unknown;
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
