import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';
import {
  emptyPortalRewardActionProgress,
  type PortalRewardAction,
  type PortalRewardActionProgress,
} from '@/lib/portal-reward-constants';

const REWARD_ACTIONS = new Set<string>([
  'profile_created',
  'daily_active',
  'stand_given',
  'mutual_stand_created',
  'endorsement_given',
]);

function getRewardsApiKey(): string | undefined {
  const key = process.env.ONSOCIAL_PORTAL_REWARDS_API_KEY?.trim();
  return key || undefined;
}

function parseProgressPayload(
  data: unknown
): PortalRewardActionProgress | null {
  if (!data || typeof data !== 'object') return null;
  const actions = (data as { actions?: unknown }).actions;
  if (!actions || typeof actions !== 'object') return null;

  const progress = emptyPortalRewardActionProgress();
  for (const [action, entry] of Object.entries(actions)) {
    if (!REWARD_ACTIONS.has(action)) continue;
    if (!entry || typeof entry !== 'object') continue;
    const count = Number((entry as { count?: unknown }).count);
    const cap = Number((entry as { cap?: unknown }).cap);
    if (!Number.isFinite(count) || !Number.isFinite(cap)) continue;
    progress[action as PortalRewardAction] = {
      count: Math.max(0, Math.trunc(count)),
      cap: Math.max(0, Math.trunc(cap)),
    };
  }

  return progress;
}

export async function loadPortalRewardActionProgress(
  accountId: string
): Promise<PortalRewardActionProgress | null> {
  const apiKey = getRewardsApiKey();
  if (!apiKey) return null;

  const url = new URL(`${ACTIVE_BACKEND_URL}/v1/portal/reward-progress`);
  url.searchParams.set('account_id', accountId);

  const response = await fetch(url.toString(), {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) return null;

  return parseProgressPayload(data);
}
