'use client';

import type { ComponentProps, MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isPortfolioOverlayPath } from '@/lib/overlay-routes';
import { beginPortfolioShelfHop } from '@/lib/portfolio-shelf-hop';

type AccountPlaceLinkProps = Omit<
  ComponentProps<typeof Link>,
  'prefetch' | 'scroll'
> & {
  prefetch?: boolean;
};

/** Carried on the profile face so Writing can open without a Home intercept. */
export const PORTFOLIO_SHELF_PARAM = 'shelf';

/**
 * From Home, `/@id/writing` is intercepted as `accountId=home` and the
 * recovery reloads the document, which throws away the mounted feed.
 * Land on the face first, then continue to the shelf from inside `/@id`.
 */
export function feedPanelHopHref(
  pathname: string,
  href: string
): string | null {
  if (pathname.startsWith('/@')) return null;
  const bare = (href.split('#')[0] ?? href).trim();
  const queryAt = bare.indexOf('?');
  const path = queryAt === -1 ? bare : bare.slice(0, queryAt);
  const query = queryAt === -1 ? '' : bare.slice(queryAt + 1);
  if (!isPortfolioOverlayPath(path)) return null;
  const match = path.match(/^\/@([^/]+)(\/.+)$/);
  if (!match?.[1] || !match[2]) return null;
  const params = new URLSearchParams(query);
  params.set(PORTFOLIO_SHELF_PARAM, match[2]);
  const face = path.slice(0, path.length - match[2].length);
  return `${face}?${params.toString()}`;
}

export function AccountPlaceLink({
  href,
  prefetch = false,
  onClick,
  ...props
}: AccountPlaceLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const target = typeof href === 'string' ? href : href.toString();
  const hop = feedPanelHopHref(pathname, target);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !hop) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    beginPortfolioShelfHop();
    router.push(hop);
  };

  return (
    <Link
      href={href}
      scroll={false}
      prefetch={prefetch}
      onClick={handleClick}
      {...props}
    />
  );
}
