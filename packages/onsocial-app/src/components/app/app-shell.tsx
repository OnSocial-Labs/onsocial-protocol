'use client';

import type { ReactNode } from 'react';
import { AppShellLauncher } from '@/components/os/summon-launcher';
import { ContextualBack } from '@/components/app/contextual-back';
import { AppWalletPill } from '@/components/wallet/app-wallet-pill';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell app-surface">
      <div className="app-shell-chrome">
        <ContextualBack fallbackHref="/" />
        <AppWalletPill variant="corner" />
      </div>
      <div className="app-shell-body">{children}</div>
      <AppShellLauncher />
    </div>
  );
}
