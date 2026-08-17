'use client';

import type { ComponentType, MouseEventHandler, ReactNode } from 'react';
import { cn } from './cn.js';
import { ExternalLinkIcon } from './mage-stroke-icons.js';
import { ProtocolMotionArrow } from './protocol-motion-arrow.js';

export const osSurfaceRowListClassName = 'os-surface-row-list';
export const osSurfaceRowClassName = 'os-surface-row';
export const osSurfaceRowNavigateClassName = 'os-surface-row--navigate';
export const osSurfaceRowCopyClassName = 'os-surface-row-copy';
export const osSurfaceRowLabelClassName = 'os-surface-row-label';
export const osSurfaceRowDescriptionClassName = 'os-surface-row-description';
export const osSurfaceRowBadgeClassName = 'os-surface-row-badge';
export const osSurfaceRowArrowClassName = 'os-surface-row-arrow';
export const osSurfaceRowExternalClassName = 'os-surface-row-external';

export type OsSurfaceRowTrailing = 'navigate' | 'external' | 'none' | ReactNode;

export interface OsSurfaceRowLinkProps {
  href: string;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
  target?: string;
  rel?: string;
}

function DefaultOsSurfaceRowLink({
  href,
  className,
  onClick,
  children,
  target,
  rel,
}: OsSurfaceRowLinkProps) {
  return (
    <a
      href={href}
      className={className}
      onClick={onClick}
      target={target}
      rel={rel}
    >
      {children}
    </a>
  );
}

export interface OsSurfaceRowListProps {
  children: ReactNode;
  className?: string;
  /** Default `nav`. Use `div` when nested inside another landmark. */
  as?: 'nav' | 'div';
  'aria-label'?: string;
}

/** Vertical stack for settings / account hub rows. */
export function OsSurfaceRowList({
  children,
  className,
  as: Comp = 'nav',
  'aria-label': ariaLabel,
}: OsSurfaceRowListProps) {
  return (
    <Comp
      className={cn(osSurfaceRowListClassName, className)}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      {children}
    </Comp>
  );
}

export interface OsSurfaceRowProps {
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  /**
   * Trailing affordance. Default: navigate chevron, unless `badge` is set
   * (then badge only). Pass a node for counts / custom meta.
   */
  trailing?: OsSurfaceRowTrailing;
  /** Quiet status pill (e.g. Soon) — used when `trailing` is omitted. */
  badge?: ReactNode;
  /** Selection chrome (customize options). */
  active?: boolean;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  className?: string;
  /**
   * Link renderer for `href` rows. Apps with a client router should pass
   * their Link (e.g. Next.js). Defaults to a plain `<a>`.
   */
  linkComponent?: ComponentType<OsSurfaceRowLinkProps>;
}

function resolveTrailing(
  trailing: OsSurfaceRowTrailing | undefined,
  badge: ReactNode | undefined
): { navigate: boolean; node: ReactNode } {
  if (trailing === 'none') {
    return {
      navigate: false,
      node:
        badge != null ? (
          <span className={osSurfaceRowBadgeClassName}>{badge}</span>
        ) : null,
    };
  }
  if (trailing === 'navigate') {
    return {
      navigate: true,
      node: <ProtocolMotionArrow className={osSurfaceRowArrowClassName} />,
    };
  }
  if (trailing === 'external') {
    return {
      navigate: false,
      node: (
        <ExternalLinkIcon
          className={osSurfaceRowExternalClassName}
          aria-hidden
        />
      ),
    };
  }
  if (trailing != null) {
    return { navigate: false, node: trailing };
  }
  if (badge != null) {
    return {
      navigate: false,
      node: <span className={osSurfaceRowBadgeClassName}>{badge}</span>,
    };
  }
  return {
    navigate: true,
    node: <ProtocolMotionArrow className={osSurfaceRowArrowClassName} />,
  };
}

/**
 * Borderless settings / account hub row — wraps `os-surface-row*` CSS.
 * Parent owns the list (`OsSurfaceRowList`); this owns label/description + trailing.
 */
export function OsSurfaceRow({
  label,
  description,
  leading,
  trailing,
  badge,
  active = false,
  href,
  external = false,
  disabled = false,
  onClick,
  className,
  linkComponent: LinkComponent = DefaultOsSurfaceRowLink,
}: OsSurfaceRowProps) {
  const { navigate, node: trailingNode } = resolveTrailing(trailing, badge);
  const rowClass = cn(
    osSurfaceRowClassName,
    navigate && osSurfaceRowNavigateClassName,
    active && 'is-active',
    className
  );

  const content = (
    <>
      {leading ? (
        <span className="os-surface-row-leading">{leading}</span>
      ) : null}
      <span className={osSurfaceRowCopyClassName}>
        <span className={osSurfaceRowLabelClassName}>{label}</span>
        {description != null && description !== '' ? (
          <span className={osSurfaceRowDescriptionClassName}>
            {description}
          </span>
        ) : null}
      </span>
      {trailingNode}
    </>
  );

  if (href && !disabled) {
    if (external) {
      return (
        <a
          className={rowClass}
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
        >
          {content}
        </a>
      );
    }
    return (
      <LinkComponent
        href={href}
        className={rowClass}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
      >
        {content}
      </LinkComponent>
    );
  }

  return (
    <button
      type="button"
      className={rowClass}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={onClick as MouseEventHandler<HTMLButtonElement> | undefined}
    >
      {content}
    </button>
  );
}
