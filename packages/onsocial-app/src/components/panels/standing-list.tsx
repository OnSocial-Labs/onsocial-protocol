'use client';

import type { ComponentProps } from 'react';
import type { StandingAccountSummary } from '@/lib/profile-social-standings';
import { standingAccountToProfileListAccount } from '@/lib/profile-list-account';
import {
  ProfileSocialListRow,
  ProfileSocialListSkeleton,
} from '@/components/panels/profile-social-list-row';

/** @deprecated Prefer {@link ProfileSocialListRow} with {@link ProfileListAccount}. */
export function StandingListRow({
  account,
  showStandingTime = true,
  ...props
}: Omit<ComponentProps<typeof ProfileSocialListRow>, 'account' | 'standingTimeMode'> & {
  account: StandingAccountSummary;
  showStandingTime?: boolean;
}) {
  return (
    <ProfileSocialListRow
      account={standingAccountToProfileListAccount(account)}
      standingTimeMode={showStandingTime ? 'always' : 'never'}
      {...props}
    />
  );
}

export { ProfileSocialListSkeleton as StandingListSkeleton };
