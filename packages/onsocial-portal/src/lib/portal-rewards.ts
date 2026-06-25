import type { Session } from '@onsocial/sdk/advanced';
import { normalizeEndorsementTopic } from '@onsocial/sdk';
import type {
  PortalRewardAction,
  PortalRewardActionProgress,
} from '@/lib/portal-reward-constants';
import { emitPortalRewardCredited } from '@/lib/portal-reward-events';

export type { PortalRewardAction };

type SocialPortalRewardAction = Exclude<PortalRewardAction, 'daily_active'>;

interface CreditPortalRewardInput {
  accountId: string | null | undefined;
  action: PortalRewardAction;
  targetAccountId?: string | null;
  topic?: string | null;
  proof?: Record<string, unknown>;
  session: Session;
}

interface PortalRewardActionResponse {
  success?: boolean;
  credited?: boolean;
  amount?: string;
  tx_hash?: string | null;
  actions?: PortalRewardActionProgress;
  error?: string;
  detail?: string;
  eligible?: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function getTxHash(proof: Record<string, unknown> | undefined): string {
  return typeof proof?.txHash === 'string' ? proof.txHash : '';
}

function normalizeAccountId(value: string | null | undefined): string | null {
  if (!value) return null;
  const accountId = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{1,63}$/.test(accountId) ? accountId : null;
}

function normalizeTopic(value: string | null | undefined): string | null {
  if (!value) return null;
  return normalizeEndorsementTopic(value) ?? null;
}

function handleRewardResponse(
  response: Response,
  data: PortalRewardActionResponse | null,
  action: PortalRewardAction,
  targetAccountId: string | null,
  topic: string | null
): void {
  if (data?.credited && data.amount) {
    emitPortalRewardCredited({
      amountYocto: data.amount,
      action,
      targetAccountId,
      topic,
      txHash: data.tx_hash ?? null,
      actions: data.actions,
    });
    return;
  }

  if (!response.ok) {
    console.warn('[portal-rewards] reward request failed', {
      status: response.status,
      action,
      error: data?.error ?? data?.detail ?? 'unknown',
      detail: data?.detail,
      eligible: data?.eligible,
      credited: data?.credited,
      body: data,
    });
  }
}

async function dispatchPortalReward({
  accountId,
  action,
  targetAccountId,
  topic,
  proof,
  session,
}: CreditPortalRewardInput): Promise<void> {
  if (typeof window === 'undefined' || !accountId) return;

  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return;

  const normalizedTargetAccountId = normalizeAccountId(targetAccountId);
  const normalizedTopic = normalizeTopic(topic);

  const message = JSON.stringify({
    account_id: normalizedAccountId,
    action,
    target_account_id: normalizedTargetAccountId,
    topic: normalizedTopic,
    tx_hash: getTxHash(proof),
    issued_at: Date.now(),
  });
  const signature = await session.key.sign(new TextEncoder().encode(message));

  const response = await fetch('/api/rewards/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_id: normalizedAccountId,
      action,
      target_account_id: normalizedTargetAccountId,
      topic: normalizedTopic,
      proof,
      auth: {
        public_key: session.key.publicKey,
        signature: bytesToBase64(signature),
        message,
      },
    }),
  });

  const data = (await response
    .json()
    .catch(() => null)) as PortalRewardActionResponse | null;
  handleRewardResponse(
    response,
    data,
    action,
    normalizedTargetAccountId,
    normalizedTopic
  );
}

function dispatchPortalRewardSafe(input: CreditPortalRewardInput): void {
  void dispatchPortalReward(input).catch(() => {
    // Rewards must never block the confirmed social action UX.
  });
}

export function creditPortalReward(input: CreditPortalRewardInput): void {
  dispatchPortalRewardSafe(input);
}

/** Credit a social action and the once-per-day active bonus (first on-chain action of the day). */
export function creditPortalSocialReward(
  input: Omit<CreditPortalRewardInput, 'action'> & {
    action: SocialPortalRewardAction;
  }
): void {
  dispatchPortalRewardSafe(input);
  dispatchPortalRewardSafe({
    accountId: input.accountId,
    action: 'daily_active',
    proof: input.proof,
    session: input.session,
  });
}
