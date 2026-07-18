'use client';

import type { ReactNode, RefObject } from 'react';
import Link from 'next/link';
import { ContextualBack } from '@/components/app/contextual-back';
import { AppShellLauncher } from '@/components/os/summon-launcher';

export interface OsAppScreenProps {
  title: string;
  /** When set, the title navigates here (e.g. guild name → guild page). */
  titleHref?: string;
  subtitle?: string;
  backFallbackHref?: string;
  /**
   * Replaces the default back control (e.g. Home avatar).
   * When set, `backFallbackHref` is unused.
   */
  leading?: ReactNode;
  /** Icon actions pinned opposite the back button (e.g. settings). */
  actions?: ReactNode;
  /** Replaces the default title/subtitle block (keep `title` for screen readers). */
  heading?: ReactNode;
  /** Overlay the header on page media; pair with `headerElevated` on scroll. */
  immersiveHeader?: boolean;
  /** Visual state for an immersive header after content scrolls. */
  headerElevated?: boolean;
  toolbar?: ReactNode;
  /** Scroll container for nested infinite lists (`.os-app-screen-body`). */
  scrollRootRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function OsAppScreen({
  title,
  titleHref,
  subtitle,
  backFallbackHref = '/',
  leading,
  actions,
  heading,
  immersiveHeader = false,
  headerElevated = false,
  toolbar,
  scrollRootRef,
  children,
}: OsAppScreenProps) {
  return (
    <div
      className="os-app-screen app-surface"
      data-tone="os"
      data-immersive-header={immersiveHeader ? 'true' : undefined}
    >
      <div className="os-app-screen-column">
        <header
          className={`os-app-screen-header${headerElevated ? ' is-elevated' : ''}`}
        >
          <div className="os-app-screen-nav-row">
            {leading ?? <ContextualBack fallbackHref={backFallbackHref} />}
            <div className="os-app-screen-heading">
              {heading ? (
                <>
                  <h1 className="sr-only">{title}</h1>
                  {heading}
                </>
              ) : (
                <>
                  <h1 className="os-app-screen-title">
                    {titleHref ? (
                      <Link
                        href={titleHref}
                        className="os-app-screen-title-link"
                        title={title}
                        scroll={false}
                      >
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </h1>
                  {subtitle ? (
                    <p className="os-app-screen-subtitle">{subtitle}</p>
                  ) : null}
                </>
              )}
            </div>
            {actions ? (
              <div className="os-app-screen-actions">{actions}</div>
            ) : null}
          </div>
          {toolbar ? (
            <div className="os-app-screen-toolbar">{toolbar}</div>
          ) : null}
        </header>
        <main ref={scrollRootRef} className="os-app-screen-body">
          {children}
        </main>
      </div>
      <AppShellLauncher />
    </div>
  );
}
