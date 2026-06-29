import { formatSocialStandingTimeMeta } from '@onsocial/ui';
import type { ProfileListAccount } from '@/lib/profile-list-account';

export function standingTimeMeta(
  account: Pick<
    ProfileListAccount,
    'standingSince' | 'standingBlockTimestamp'
  >
): { label: string; description: string } | null {
  return formatSocialStandingTimeMeta(account);
}
