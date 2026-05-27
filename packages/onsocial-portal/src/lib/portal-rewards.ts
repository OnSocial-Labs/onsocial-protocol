import type { Session } from '@onsocial/sdk/advanced';
import { normalizeEndorsementTopic } from '@onsocial/sdk';

export type PortalRewardAction =
  | 'profile_created'
  | 'daily_active'
  | 'stand_given'
  | 'mutual_stand_created'
  | 'endorsement_given';

type SocialPortalRewardAction = Exclude<PortalRewardAction, 'daily_active'>;

interface CreditPortalRewardInput {
  accountId: string | null | undefined;
  action: PortalRewardAction;
  targetAccountId?: string | null;
  topic?: string | null;
  proof?: Record<string, unknown>;
  session: Session;
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

function dispatchPortalReward({
  accountId,
  action,
  targetAccountId,
  topic,
  proof,
  session,
}: CreditPortalRewardInput): void {
  if (typeof window === 'undefined' || !accountId) return;

  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return;

  const normalizedTargetAccountId = normalizeAccountId(targetAccountId);
  const normalizedTopic = normalizeTopic(topic);

  (async () => {
    const message = JSON.stringify({
      account_id: normalizedAccountId,
      action,
      target_account_id: normalizedTargetAccountId,
      topic: normalizedTopic,
      tx_hash: getTxHash(proof),
      issued_at: Date.now(),
    });
    const signature = await session.key.sign(
      new TextEncoder().encode(message)
    );

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

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as {
        error?: string;
        detail?: string;
        eligible?: boolean;
        credited?: boolean;
      } | null;
      console.warn('[portal-rewards] reward request failed', {
        status: response.status,
        action,
        error: detail?.error ?? detail?.detail ?? 'unknown',
        detail: detail?.detail,
        eligible: detail?.eligible,
        credited: detail?.credited,
        body: detail,
      });
    }
  })().catch(() => {
    // Rewards must never block the confirmed social action UX.
  });
}

export function creditPortalReward(input: CreditPortalRewardInput): void {
  dispatchPortalReward(input);
}

/** Credit a social action and the once-per-day active bonus (first on-chain action of the day). */
export function creditPortalSocialReward(
  input: Omit<CreditPortalRewardInput, 'action'> & {
    action: SocialPortalRewardAction;
  }
): void {
  dispatchPortalReward(input);
  dispatchPortalReward({
    accountId: input.accountId,
    action: 'daily_active',
    proof: input.proof,
    session: input.session,
  });
}
