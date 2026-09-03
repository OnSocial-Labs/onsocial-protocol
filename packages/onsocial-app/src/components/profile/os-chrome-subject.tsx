'use client';

import type { ComponentProps } from 'react';
import { OsChromeSubject as UiOsChromeSubject } from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import { peekPostAuthorKind } from '@/hooks/use-post-author-profiles';
import { accountAvatarShape } from '@/lib/account-avatar-shape';

type AppOsChromeSubjectProps = ComponentProps<typeof UiOsChromeSubject> & {
  kind?: ProfileKind | null;
  isDao?: boolean;
};

/** Chrome identity — applies person / org / dao avatar geometry. */
export function OsChromeSubject({
  kind,
  isDao,
  shape,
  ...props
}: AppOsChromeSubjectProps) {
  const resolved =
    shape ??
    accountAvatarShape(
      props.accountId,
      kind ?? peekPostAuthorKind(props.accountId),
      isDao
    );
  return <UiOsChromeSubject {...props} shape={resolved} />;
}
