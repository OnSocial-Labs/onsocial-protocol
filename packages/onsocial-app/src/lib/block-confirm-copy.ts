import { displayName } from '@/lib/profile-display';

/** Shared Block confirm copy for post menu / profile More / lists. */
export function blockConfirmCopy(input: {
  accountId: string;
  profileName?: string | null;
}): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const label = displayName(input.accountId, input.profileName ?? undefined);
  return {
    title: `Block ${label}?`,
    body: `${label} won’t be able to stand with you, and you won’t see each other in feeds. You can unblock anytime.`,
    confirmLabel: 'Block',
  };
}

export const MUTE_ACTION_DESCRIPTION = 'Hide their posts in your feeds';
export const BLOCK_ACTION_DESCRIPTION =
  'Stop seeing each other — confirms before it goes through';
export const MUTE_LIST_HINT = 'Muted accounts stay off-chain. Unmute anytime.';
export const BLOCK_LIST_HINT =
  'Blocked accounts are on-chain. Unblock anytime from here.';
