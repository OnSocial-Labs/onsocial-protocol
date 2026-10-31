'use client';

import type { ComponentProps } from 'react';
import { useSyncExternalStore } from 'react';
import { ProfileAvatar } from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import { peekPostAuthorKind } from '@/hooks/use-post-author-profiles';
import { accountAvatarShape } from '@/lib/account-avatar-shape';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

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
  const clientMounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  const resolved =
    shape ??
    (accountId
      ? accountAvatarShape(
          accountId,
          kind ?? (clientMounted ? peekPostAuthorKind(accountId) : undefined),
          isDao
        )
      : 'circle');
  return <ProfileAvatar {...props} shape={resolved} />;
}
