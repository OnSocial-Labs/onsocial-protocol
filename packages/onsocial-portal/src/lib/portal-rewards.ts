import type { Session } from '@onsocial/sdk/advanced';

export type PortalRewardAction =
  | 'profile_created'
  | 'stand_given'
  | 'mutual_stand_created'
  | 'endorsement_given';

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

export function creditPortalReward({
  accountId,
  action,
  targetAccountId,
  topic,
  proof,
  session,
}: CreditPortalRewardInput): void {
  if (typeof window === 'undefined' || !accountId) return;

  (async () => {
    const message = JSON.stringify({
      account_id: accountId,
      action,
      target_account_id: targetAccountId ?? null,
      topic: topic ?? null,
      tx_hash: getTxHash(proof),
      issued_at: Date.now(),
    });
    const signature = await session.key.sign(
      new TextEncoder().encode(message)
    );

    await fetch('/api/rewards/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        action,
        target_account_id: targetAccountId,
        topic,
        proof,
        auth: {
          public_key: session.key.publicKey,
          signature: bytesToBase64(signature),
          message,
        },
      }),
    });
  })().catch(() => {
    // Rewards must never block the confirmed social action UX.
  });
}
