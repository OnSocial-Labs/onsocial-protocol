'use client';

import { useEffect, type ComponentProps, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  accountIdFromPath,
  isPortfolioOverlayPath,
} from '@/lib/overlay-routes';
import {
  beginPortfolioShelfHop,
  type PortfolioShelfHopFace,
} from '@/lib/portfolio-shelf-hop';
import { startWritingShelfWarm } from '@/lib/writing-shelf-warm';

type AccountPlaceLinkProps = Omit<
  ComponentProps<typeof Link>,
  'prefetch' | 'scroll'
> & {
  prefetch?: boolean;
  /** Name already on the reader, so the Writing sheet can open with it. */
  shelfFace?: Pick<PortfolioShelfHopFace, 'titleLabel' | 'avatarUrl'> | null;
};

type RouterPrefetch = (href: string, options?: { kind: 'full' }) => void;

/** Full payload, so Home does not cache the intercepted misfire. */
export function prefetchPortfolioHref(prefetch: RouterPrefetch, href: string) {
  prefetch(href, { kind: 'full' });
}

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

function shelfHopFace(
  hop: string,
  hint?: AccountPlaceLinkProps['shelfFace']
): PortfolioShelfHopFace | null {
  const accountId = accountIdFromPath(hop.split('?')[0] ?? hop);
  if (!accountId) return null;
  return {
    accountId,
    titleLabel: hint?.titleLabel?.trim() || accountId,
    avatarUrl: hint?.avatarUrl ?? null,
  };
}

export function AccountPlaceLink({
  href,
  prefetch = false,
  onClick,
  shelfFace,
  ...props
}: AccountPlaceLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const target = typeof href === 'string' ? href : href.toString();
  const hop = feedPanelHopHref(pathname, target);
  const faceLabel = shelfFace?.titleLabel ?? null;
  const faceAvatar = shelfFace?.avatarUrl ?? null;

  useEffect(() => {
    if (!hop) return;
    const face = shelfHopFace(hop, {
      titleLabel: faceLabel ?? '',
      avatarUrl: faceAvatar,
    });
    if (face) startWritingShelfWarm(face.accountId);
    prefetchPortfolioHref(router.prefetch as RouterPrefetch, hop);
  }, [faceAvatar, faceLabel, hop, router]);

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
    const face = shelfHopFace(hop, shelfFace);
    if (face) startWritingShelfWarm(face.accountId);
    prefetchPortfolioHref(router.prefetch as RouterPrefetch, hop);
    beginPortfolioShelfHop(face);
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
