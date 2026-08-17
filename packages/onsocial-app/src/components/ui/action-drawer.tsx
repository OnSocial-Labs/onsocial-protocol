'use client';

import Link from 'next/link';
import {
  ActionDrawer as UiActionDrawer,
  type ActionDrawerLinkProps,
  type ActionDrawerProps,
} from '@onsocial/ui';

/**
 * Next.js Link adapter for ActionDrawer `href` items.
 * Prefer importing `ActionDrawer` from `@onsocial/ui` with `linkComponent`
 * when outside the app package.
 */
function NextActionDrawerLink({
  href,
  className,
  role,
  onClick,
  children,
}: ActionDrawerLinkProps) {
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      role={role}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

export function ActionDrawer(props: ActionDrawerProps) {
  return <UiActionDrawer linkComponent={NextActionDrawerLink} {...props} />;
}

export {
  osActionDrawerConfirmBodyClassName,
  osActionDrawerConfirmCancelClassName,
  osActionDrawerConfirmClassName,
  osActionDrawerIconClassName,
  type ActionDrawerItem,
  type ActionDrawerLinkProps,
  type ActionDrawerProps,
} from '@onsocial/ui';
