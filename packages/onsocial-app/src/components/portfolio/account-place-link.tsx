'use client';

import { useEffect, type ComponentProps, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  accountIdFromPath,
  isPortfolioOverlayPath,
  writingCatalogOpenerHref,
  writingShelfBackHref,
} from '@/lib/overlay-routes';
import {
  beginPortfolioShelfHop,
  endPortfolioShelfHop,
  type PortfolioShelfHopFace,
} from '@/lib/portfolio-shelf-hop';
import { clearParkedShelfHopArticle } from '@/lib/shelf-hop-article-park';
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
 * recovery reloads the document. Land on the face first, then continue to
 * the shelf from inside `/@id` — only when a feed article is parked under.
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

/** Author Writing shelf or article — not a profile face. */
export function isWritingShelfHref(href: string): boolean {
  const path = (href.split('#')[0] ?? href).split('?')[0] ?? '';
  return /\/writing(?:\/|$)/.test(path);
}

/**
 * Hard-assign Writing only when Collectibles / Drops opened the visit.
 * Feed / portfolio soft-open the glass shelf (Writing dialog).
 */
export function shouldSolidAssignWritingShelf(
  href: string,
  pathname: string
): boolean {
  if (!isWritingShelfHref(href)) return false;
  if (writingCatalogOpenerHref(pathname)) return true;
  const bare = (href.split('#')[0] ?? href).trim();
  const q = bare.indexOf('?');
  const path = q === -1 ? bare : bare.slice(0, q);
  const search = q === -1 ? '' : bare.slice(q + 1);
  const accountId = accountIdFromPath(path);
  if (!accountId) return false;
  return Boolean(
    writingCatalogOpenerHref(writingShelfBackHref(accountId, search))
  );
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
  const solidWriting = shouldSolidAssignWritingShelf(
    target,
    pathname ?? ''
  );
  const faceLabel = shelfFace?.titleLabel ?? null;
  const faceAvatar = shelfFace?.avatarUrl ?? null;

  useEffect(() => {
    if (!hop || solidWriting) return;
    const face = shelfHopFace(hop, {
      titleLabel: faceLabel ?? '',
      avatarUrl: faceAvatar,
    });
    if (face) startWritingShelfWarm(face.accountId);
    prefetchPortfolioHref(router.prefetch as RouterPrefetch, hop);
  }, [faceAvatar, faceLabel, hop, router, solidWriting]);

  const handlePlaceClick = (event: MouseEvent<HTMLAnchorElement>) => {
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
    flushSync(() => {
      beginPortfolioShelfHop(face);
    });
    router.push(hop);
  };

  const leaveToSolidShelf = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    endPortfolioShelfHop();
    clearParkedShelfHopArticle();
    window.location.assign(target);
  };

  if (solidWriting) {
    return (
      <a
        href={target}
        onPointerDown={leaveToSolidShelf}
        onClick={leaveToSolidShelf}
        {...props}
      />
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      prefetch={prefetch}
      onClick={handlePlaceClick}
      {...props}
    />
  );
}
