'use client';

import { AppSocialBalanceProvider } from '@/contexts/app-social-balance-context';
import { AppRewardsProvider } from '@/contexts/app-rewards-context';
import {
  AppAccountSheetHost,
  AppAccountSheetProvider,
} from '@/contexts/app-account-sheet-context';
import { AppWalletProvider } from '@/contexts/app-wallet-context';
import { PortfolioCustomizeProvider } from '@/contexts/portfolio-customize-context';
import { ViewerProfileShellProvider } from '@/contexts/viewer-profile-shell-context';
import { ViewerWalletMoodProvider } from '@/contexts/viewer-wallet-mood-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppWalletProvider>
      <AppSocialBalanceProvider>
        <ViewerProfileShellProvider>
          <ViewerWalletMoodProvider>
            <AppAccountSheetProvider>
              <AppRewardsProvider>
                <PortfolioCustomizeProvider>
                  {children}
                  <AppAccountSheetHost />
                </PortfolioCustomizeProvider>
              </AppRewardsProvider>
            </AppAccountSheetProvider>
          </ViewerWalletMoodProvider>
        </ViewerProfileShellProvider>
      </AppSocialBalanceProvider>
    </AppWalletProvider>
  );
}
