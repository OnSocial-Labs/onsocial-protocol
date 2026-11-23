'use client';

import type { ComponentProps } from 'react';
import {
  StandingIdentity as UiStandingIdentity,
  type StandingIdentityShowHandle,
} from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import {
  arePostAuthorProfilesResolved,
  peekPostAuthorKind,
} from '@/hooks/use-post-author-profiles';
import { accountAvatarShape } from '@/lib/account-avatar-shape';

export type { StandingIdentityShowHandle };

type AppStandingIdentityProps = ComponentProps<typeof UiStandingIdentity> & {
  kind?: ProfileKind | null;
  isDao?: boolean;
};

/**
 * Standing row identity — person / org / dao geometry.
 * Unknown profiles use the cool grey avatar shell (never a letter flash).
 */
export function StandingIdentity({
  kind,
  isDao,
  shape,
  shellLoading,
  avatarUrl,
  ...props
}: AppStandingIdentityProps) {
  const resolved =
    shape ??
    accountAvatarShape(
      props.accountId,
      kind ?? peekPostAuthorKind(props.accountId),
      isDao
    );
  const src = avatarUrl?.trim() || null;
  const autoShell =
    shellLoading ??
    (!src && !arePostAuthorProfilesResolved([props.accountId]));
  return (
    <UiStandingIdentity
      {...props}
      avatarUrl={avatarUrl}
      shape={resolved}
      shellLoading={autoShell}
    />
  );
}
