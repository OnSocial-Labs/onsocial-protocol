'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { getPortalProfileUrl } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

const profileGraphRowClass =
  'group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none';

const profileGraphChipClass =
  'group/chip inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]';

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
}: {
  accountId: string;
  pageLayout?: boolean;
  onNavigate?: (accountId: string) => void;
  className?: string;
  children: ReactNode;
  onPointerDown?: (event: MouseEvent) => void;
  onClick?: (event: MouseEvent) => void;
}) {
  if (pageLayout) {
    return (
      <Link
        href={getPortalProfileUrl(accountId)}
        prefetch
        onClick={onClick}
        onPointerDown={onPointerDown}
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
      className={cn(profileGraphChipClass, className)}
    >
      {children}
    </button>
  );
}
