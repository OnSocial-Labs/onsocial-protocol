'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import {
  osFloatingPanelClassName,
  osSheetFloatingPanelClassName,
} from '@onsocial/ui';

export type OsNoticeCardAlign = 'start' | 'center';

export interface OsNoticeCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** `center` for info (How SOCIAL); `start` for confirms. */
  align?: OsNoticeCardAlign;
  /** Wrap in floating glass shell. Off when already inside a panel (guild menu). */
  shell?: boolean;
  title: ReactNode;
  titleId?: string;
  meta?: ReactNode;
  body?: ReactNode;
  bodyId?: string;
  /** Toggles, errors, extra fields between copy and footer. */
  children?: ReactNode;
  footer: ReactNode;
}

/**
 * Shared info / confirm card chrome.
 * Same glass + type + commit language across SOCIAL help, discard, guild confirms.
 */
export function OsNoticeCard({
  align = 'start',
  shell = false,
  title,
  titleId,
  meta,
  body,
  bodyId,
  children,
  footer,
  className,
  ...props
}: OsNoticeCardProps) {
  const classes = [
    'os-notice-card',
    align === 'center' ? 'os-notice-card--center' : null,
    shell ? osFloatingPanelClassName : null,
    shell ? osSheetFloatingPanelClassName : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      <div className="os-notice-card-copy">
        <p id={titleId} className="os-notice-card-title">
          {title}
        </p>
        {meta ? <p className="os-notice-card-meta">{meta}</p> : null}
        {body ? (
          <p id={bodyId} className="os-notice-card-body">
            {body}
          </p>
        ) : null}
      </div>
      {children}
      <div className="os-notice-card-footer">{footer}</div>
    </div>
  );
}
