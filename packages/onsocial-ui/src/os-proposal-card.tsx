'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export type OsProposalCardSurface = 'bordered' | 'row';

export const osProposalCardListClassName = 'os-proposal-card-list';
export const osProposalCardClassName = 'os-proposal-card';
export const osProposalCardStripClassName = 'os-proposal-card-strip';
export const osProposalCardStripMainClassName = 'os-proposal-card-strip-main';
export const osProposalCardStripStartClassName = 'os-proposal-card-strip-start';
export const osProposalCardStripEndClassName = 'os-proposal-card-strip-end';
export const osProposalCardSepClassName = 'os-proposal-card-sep';
export const osProposalCardBodyClassName = 'os-proposal-card-body';
export const osProposalCardFooterClassName = 'os-proposal-card-footer';
export const osProposalCardActionsClassName = 'os-proposal-card-actions';

/**
 * Shared proposal-card shell for Sputnik (protocol / treasury / communities)
 * and guild core proposals. Pair with `os-proposal-card.css`.
 *
 * Domain owns tones, washes, vote UI, and inner content.
 */
export function OsProposalCard({
  surface = 'row',
  className,
  children,
  ...rest
}: {
  surface?: OsProposalCardSurface;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  return (
    <article
      className={cn(
        osProposalCardClassName,
        surface === 'bordered'
          ? 'os-proposal-card--bordered'
          : 'os-proposal-card--row',
        className
      )}
      {...rest}
    >
      {children}
    </article>
  );
}

export function OsProposalCardList({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  return (
    <div className={cn(osProposalCardListClassName, className)} {...rest}>
      {children}
    </div>
  );
}

export function OsProposalCardStrip({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  return (
    <header className={cn(osProposalCardStripClassName, className)} {...rest}>
      {children}
    </header>
  );
}

export function OsProposalCardStripMain({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  return (
    <div className={cn(osProposalCardStripMainClassName, className)} {...rest}>
      {children}
    </div>
  );
}

export function OsProposalCardStripStart({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  return (
    <div className={cn(osProposalCardStripStartClassName, className)} {...rest}>
      {children}
    </div>
  );
}

export function OsProposalCardStripEnd({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  return (
    <div className={cn(osProposalCardStripEndClassName, className)} {...rest}>
      {children}
    </div>
  );
}

export function OsProposalCardSep({
  className,
  ...rest
}: { className?: string } & Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children' | 'className'
>) {
  return (
    <span
      className={cn(osProposalCardSepClassName, className)}
      aria-hidden="true"
      {...rest}
    >
      ·
    </span>
  );
}

export function OsProposalCardBody({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  return (
    <div className={cn(osProposalCardBodyClassName, className)} {...rest}>
      {children}
    </div>
  );
}

export function OsProposalCardFooter({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  return (
    <footer className={cn(osProposalCardFooterClassName, className)} {...rest}>
      {children}
    </footer>
  );
}
