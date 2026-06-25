'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  getPortalEndorsementsUrl,
  getPortalNetworkUrl,
  getPortalProfileUrl,
  getPortalStandUrl,
  type PortalEndorsementsMode,
  type PortalStandKind,
} from '@/lib/portal-config';
import { cn } from '@/lib/utils';

const profileGraphRowClass =
  'group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none';

const profileGraphChipClass =
  'group/chip inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]';

/** Prefetch stand / endorsements sub-routes once per href (hover or focus). */
export function useProfileGraphRoutePrefetch(accountId: string | undefined) {
  const router = useRouter();
  const prefetchedRef = useRef(new Set<string>());

  useEffect(() => {
    prefetchedRef.current.clear();
  }, [accountId]);

  const prefetchHref = useCallback(
    (href: string) => {
      if (!href || prefetchedRef.current.has(href)) return;
      prefetchedRef.current.add(href);
      router.prefetch(href);
    },
    [router]
  );

  const prefetchStand = useCallback(
    (kind: PortalStandKind) => {
      if (!accountId) return;
      prefetchHref(getPortalStandUrl(accountId, kind));
    },
    [accountId, prefetchHref]
  );

  const prefetchEndorsements = useCallback(
    (mode: PortalEndorsementsMode) => {
      if (!accountId) return;
      prefetchHref(getPortalEndorsementsUrl(accountId, { mode }));
    },
    [accountId, prefetchHref]
  );

  const prefetchNetwork = useCallback(() => {
    if (!accountId) return;
    prefetchHref(getPortalNetworkUrl(accountId));
  }, [accountId, prefetchHref]);

  return { prefetchStand, prefetchEndorsements, prefetchNetwork };
}

export function graphRoutePrefetchProps(prefetch?: () => void): {
  onPointerEnter?: () => void;
  onFocus?: () => void;
} {
  if (!prefetch) return {};
  return {
    onPointerEnter: prefetch,
    onFocus: prefetch,
  };
}

export function ProfileGraphRowLink({
  accountId,
  pageLayout = false,
  onNavigate,
  className,
  children,
}: {
  accountId: string;
  pageLayout?: boolean;
  onNavigate?: (accountId: string) => void;
  className?: string;
  children: ReactNode;
}) {
  if (pageLayout) {
    return (
      <Link
        href={getPortalProfileUrl(accountId)}
        prefetch
        className={cn(profileGraphRowClass, className)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(accountId)}
      className={cn(profileGraphRowClass, className)}
    >
      {children}
    </button>
  );
}

export function ProfileGraphChipLink({
  accountId,
  pageLayout = false,
  onNavigate,
  className,
  children,
  onPointerDown,
  onClick,
  ariaLabel,
}: {
  accountId: string;
  pageLayout?: boolean;
  onNavigate?: (accountId: string) => void;
  className?: string;
  children: ReactNode;
  onPointerDown?: (event: MouseEvent) => void;
  onClick?: (event: MouseEvent) => void;
  ariaLabel?: string;
}) {
  if (pageLayout) {
    return (
      <Link
        href={getPortalProfileUrl(accountId)}
        prefetch
        onClick={onClick}
        onPointerDown={onPointerDown}
        aria-label={ariaLabel}
        className={cn(profileGraphChipClass, className)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        onNavigate?.(accountId);
      }}
      onPointerDown={onPointerDown}
      aria-label={ariaLabel}
      className={cn(profileGraphChipClass, className)}
    >
      {children}
    </button>
  );
}
