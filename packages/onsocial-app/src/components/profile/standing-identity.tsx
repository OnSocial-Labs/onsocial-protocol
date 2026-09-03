'use client';

import type { ComponentProps } from 'react';
import {
  StandingIdentity as UiStandingIdentity,
  type StandingIdentityShowHandle,
} from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import { peekPostAuthorKind } from '@/hooks/use-post-author-profiles';
import { accountAvatarShape } from '@/lib/account-avatar-shape';

export type { StandingIdentityShowHandle };

type AppStandingIdentityProps = ComponentProps<typeof UiStandingIdentity> & {
  kind?: ProfileKind | null;
  isDao?: boolean;
};

/** Standing row identity — applies person / org / dao avatar geometry. */
export function StandingIdentity({
  kind,
  isDao,
  shape,
  ...props
}: AppStandingIdentityProps) {
  const resolved =
    shape ??
    accountAvatarShape(
      props.accountId,
      kind ?? peekPostAuthorKind(props.accountId),
      isDao
    );
  return <UiStandingIdentity {...props} shape={resolved} />;
}
