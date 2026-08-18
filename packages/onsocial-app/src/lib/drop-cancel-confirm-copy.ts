/** Shared Cancel-drop confirm copy for Drop page Manage. */
export function dropCancelConfirmCopy(input: {
  title?: string | null;
  refundableCount: number;
  depositNearLabel: string;
  claimDays: number;
}): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const name = input.title?.trim() || 'this drop';
  const count = Math.max(0, Math.floor(input.refundableCount));
  const days = Math.max(1, Math.floor(input.claimDays));
  const pool =
    count === 0
      ? 'No tickets need a refund pool (nothing minted, or all fully redeemed).'
      : `You’ll attach ${input.depositNearLabel} NEAR for ${count} refundable ticket${count === 1 ? '' : 's'}. Holders can claim within ${days} days.`;

  return {
    title: `Cancel ${name}?`,
    body: `${pool} Minting stops. This can’t be undone.`,
    confirmLabel: 'Cancel drop',
  };
}

/** Withdraw leftover refund pool after the claim window. */
export function dropWithdrawRefundsCopy(input: {
  title?: string | null;
}): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const name = input.title?.trim() || 'this drop';
  return {
    title: `Withdraw unclaimed from ${name}?`,
    body: 'The claim window is over. Leftover refund pool NEAR returns to you.',
    confirmLabel: 'Withdraw',
  };
}
