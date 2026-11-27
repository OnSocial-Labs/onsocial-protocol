'use client';

import type { ComponentProps } from 'react';
import { useSyncExternalStore } from 'react';
import {
  StandingIdentity as UiStandingIdentity,
  type StandingIdentityShowHandle,
} from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import { peekPostAuthorKind } from '@/hooks/use-post-author-profiles';
import { accountAvatarShape } from '@/lib/account-avatar-shape';

export type { StandingIdentityShowHandle };

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

type AppStandingIdentityProps = ComponentProps<typeof UiStandingIdentity> & {
  kind?: ProfileKind | null;
  isDao?: boolean;
};

/**
 * Standing row identity — person / org / dao geometry.
 * Letter until `avatarUrl` lands (opaque soft-replace). Do not derive
 * `shellLoading` from the client profile cache — that mismatches SSR HTML
 * (letter vs shimmer) and remounts the activity row. Pass `shellLoading`
 * explicitly when a seat is pending with the same value on server + client.
 */
export function StandingIdentity({
  kind,
  isDao,
  shape,
  shellLoading = false,
  avatarUrl,
  ...props
}: AppStandingIdentityProps) {
  const clientMounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  const resolved =
    shape ??
    accountAvatarShape(
      props.accountId,
      kind ?? (clientMounted ? peekPostAuthorKind(props.accountId) : undefined),
      isDao
    );
  return (
    <UiStandingIdentity
      {...props}
      avatarUrl={avatarUrl}
      shape={resolved}
      shellLoading={shellLoading}
    />
  );
}
