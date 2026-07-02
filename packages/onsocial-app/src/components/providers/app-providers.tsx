'use client';

import { AppRewardsProvider } from '@/contexts/app-rewards-context';
import { AppAccountSheetProvider } from '@/contexts/app-account-sheet-context';
import { AppWalletProvider } from '@/contexts/app-wallet-context';
import { PortfolioCustomizeProvider } from '@/contexts/portfolio-customize-context';
import { ViewerProfileShellProvider } from '@/contexts/viewer-profile-shell-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppWalletProvider>
      <AppRewardsProvider>
        <ViewerProfileShellProvider>
          <PortfolioCustomizeProvider>
            <AppAccountSheetProvider>{children}</AppAccountSheetProvider>
          </PortfolioCustomizeProvider>
        </ViewerProfileShellProvider>
      </AppRewardsProvider>
    </AppWalletProvider>
  );
}
