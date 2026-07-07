'use client';

import type { ReactNode, RefObject } from 'react';
import { ContextualBack } from '@/components/app/contextual-back';
import { AppShellLauncher } from '@/components/os/summon-launcher';

export interface OsAppScreenProps {
  title: string;
  subtitle?: string;
  backFallbackHref?: string;
  /** Icon actions pinned opposite the back button (e.g. settings). */
  actions?: ReactNode;
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
  subtitle,
  backFallbackHref = '/',
  actions,
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
            <ContextualBack fallbackHref={backFallbackHref} />
            <div className="os-app-screen-heading">
              <h1 className="os-app-screen-title">{title}</h1>
              {subtitle ? (
                <p className="os-app-screen-subtitle">{subtitle}</p>
              ) : null}
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
