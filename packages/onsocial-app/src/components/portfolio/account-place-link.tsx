'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type AccountPlaceLinkProps = Omit<
  ComponentProps<typeof Link>,
  'prefetch' | 'scroll'
> & {
  prefetch?: boolean;
};

/**
 * Soft nav on `/@…`. From Home / app routes, hard-load so Next does not
 * intercept Writing as `accountId=home` (first click would only reload).
 */
export function AccountPlaceLink({
  href,
  prefetch = false,
  ...props
}: AccountPlaceLinkProps) {
  const pathname = usePathname();
  if (!pathname.startsWith('/@')) {
    const target = typeof href === 'string' ? href : href.toString();
    return <a href={target} {...props} />;
  }
  return <Link href={href} scroll={false} prefetch={prefetch} {...props} />;
}
