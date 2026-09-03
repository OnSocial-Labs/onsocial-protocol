'use client';

import type { ComponentProps } from 'react';
import { ProfileAvatar } from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import { peekPostAuthorKind } from '@/hooks/use-post-author-profiles';
import { accountAvatarShape } from '@/lib/account-avatar-shape';

type AccountAvatarProps = ComponentProps<typeof ProfileAvatar> & {
  accountId?: string | null;
  kind?: ProfileKind | null;
  isDao?: boolean;
};

/** Account face — person circle, org squircle, DAO square. */
export function AccountAvatar({
  accountId,
  kind,
  isDao,
  shape,
  ...props
}: AccountAvatarProps) {
  const resolved =
    shape ??
    (accountId
      ? accountAvatarShape(
          accountId,
          kind ?? peekPostAuthorKind(accountId),
          isDao
        )
      : 'circle');
  return <ProfileAvatar {...props} shape={resolved} />;
}
