'use client';

import type { ReactNode, RefObject } from 'react';
import { ContextualBack } from '@/components/app/contextual-back';
import { AppShellLauncher } from '@/components/os/summon-launcher';
import { AppWalletPill } from '@/components/wallet/app-wallet-pill';

export interface OsAppScreenProps {
  title: string;
  subtitle?: string;
  backFallbackHref?: string;
  toolbar?: ReactNode;
  /** Scroll container for nested infinite lists (`.os-app-screen-body`). */
  scrollRootRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function OsAppScreen({
  title,
  subtitle,
  backFallbackHref = '/',
  toolbar,
  scrollRootRef,
  children,
}: OsAppScreenProps) {
  return (
    <div className="os-app-screen app-surface" data-tone="os">
      <div className="os-app-screen-column">
        <header className="os-app-screen-header">
          <div className="os-app-screen-nav-row">
            <ContextualBack fallbackHref={backFallbackHref} />
            <div className="os-app-screen-heading">
              <h1 className="os-app-screen-title">{title}</h1>
              {subtitle ? (
                <p className="os-app-screen-subtitle">{subtitle}</p>
              ) : null}
            </div>
            <AppWalletPill variant="icon" />
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
