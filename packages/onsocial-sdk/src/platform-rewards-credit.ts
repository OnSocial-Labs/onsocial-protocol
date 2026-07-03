import type { Session } from './advanced/session.js';
import { normalizeEndorsementTopic } from './builders/endorsement.js';
import type {
  PlatformRewardAction,
  SocialPlatformRewardAction,
} from './platform-reward-actions.js';

export interface PlatformRewardCreditEvent {
  amountYocto: string;
  action: PlatformRewardAction;
  targetAccountId?: string | null;
  /** Profile name snapshot from the social surface that triggered the credit. */
  targetDisplayName?: string | null;
  topic?: string | null;
  txHash?: string | null;
}

export interface CreditPlatformRewardInput {
  accountId: string | null | undefined;
  action: PlatformRewardAction;
  targetAccountId?: string | null;
  targetDisplayName?: string | null;
  topic?: string | null;
  proof?: Record<string, unknown>;
  session: Session;
  /** Next.js route that verifies eligibility and proxies to backend. */
  actionPath?: string;
  onCredited?: (event: PlatformRewardCreditEvent) => void;
}

interface PlatformRewardActionResponse {
  success?: boolean;
  credited?: boolean;
  amount?: string;
  tx_hash?: string | null;
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

function normalizeDisplayName(value: string | null | undefined): string | null {
  const name = value?.trim();
  return name || null;
}

function handleRewardResponse(
  response: Response,
  data: PlatformRewardActionResponse | null,
  action: PlatformRewardAction,
  targetAccountId: string | null,
  targetDisplayName: string | null,
  topic: string | null,
  onCredited?: (event: PlatformRewardCreditEvent) => void
): void {
  if (data?.credited && data.amount) {
    onCredited?.({
      amountYocto: data.amount,
      action,
      targetAccountId,
      targetDisplayName,
      topic,
      txHash: data.tx_hash ?? null,
    });
    return;
  }

  if (!response.ok && typeof console !== 'undefined') {
    console.warn('[platform-rewards] reward request failed', {
      status: response.status,
      action,
      error: data?.error ?? data?.detail ?? 'unknown',
      detail: data?.detail,
      eligible: data?.eligible,
      credited: data?.credited,
    });
  }
}

export async function creditPlatformReward(
  input: CreditPlatformRewardInput
): Promise<void> {
  if (typeof window === 'undefined') return;

  const {
    accountId,
    action,
    targetAccountId,
    targetDisplayName,
    topic,
    proof,
    session,
    actionPath = '/api/rewards/action',
    onCredited,
  } = input;

  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return;

  const normalizedTargetAccountId = normalizeAccountId(targetAccountId);
  const normalizedTargetDisplayName = normalizeDisplayName(targetDisplayName);
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

  const response = await fetch(actionPath, {
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
    .catch(() => null)) as PlatformRewardActionResponse | null;
  handleRewardResponse(
    response,
    data,
    action,
    normalizedTargetAccountId,
    normalizedTargetDisplayName,
    normalizedTopic,
    onCredited
  );
}

export function creditPlatformRewardSafe(
  input: CreditPlatformRewardInput
): void {
  void creditPlatformReward(input).catch(() => {
    // Rewards must never block the confirmed social action UX.
  });
}

/** Credit a social action and the once-per-day active bonus (first on-chain action of the day). */
export function creditPlatformSocialReward(
  input: Omit<CreditPlatformRewardInput, 'action'> & {
    action: SocialPlatformRewardAction;
  }
): void {
  creditPlatformRewardSafe(input);
  creditPlatformRewardSafe({
    accountId: input.accountId,
    action: 'daily_active',
    proof: input.proof,
    session: input.session,
    actionPath: input.actionPath,
    onCredited: input.onCredited,
  });
}
