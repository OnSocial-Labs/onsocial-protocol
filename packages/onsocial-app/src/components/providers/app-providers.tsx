'use client';

import { AppSocialBalanceProvider } from '@/contexts/app-social-balance-context';
import { AppRewardsProvider } from '@/contexts/app-rewards-context';
import {
  AppAccountSheetHost,
  AppAccountSheetProvider,
} from '@/contexts/app-account-sheet-context';
import { CollectiblesNowPlayingProvider } from '@/contexts/collectibles-now-playing-context';
import { AppTransactionFeedbackProvider } from '@/contexts/app-transaction-feedback-context';
import { AppWalletProvider } from '@/contexts/app-wallet-context';
import { ComposeLauncherProvider } from '@/contexts/compose-launcher-context';
import { PortfolioCustomizeProvider } from '@/contexts/portfolio-customize-context';
import { ViewerProfileShellProvider } from '@/contexts/viewer-profile-shell-context';
import { ViewerWalletMoodProvider } from '@/contexts/viewer-wallet-mood-context';
import { DropComposeHost } from '@/features/scarces/drop-compose-host';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppWalletProvider>
      <AppTransactionFeedbackProvider>
        <AppSocialBalanceProvider>
          <ViewerProfileShellProvider>
            <ViewerWalletMoodProvider>
              <AppAccountSheetProvider>
                <AppRewardsProvider>
                  <PortfolioCustomizeProvider>
                    <ComposeLauncherProvider>
                      <CollectiblesNowPlayingProvider>
                        {children}
                        <DropComposeHost />
                        <AppAccountSheetHost />
                      </CollectiblesNowPlayingProvider>
                    </ComposeLauncherProvider>
                  </PortfolioCustomizeProvider>
                </AppRewardsProvider>
              </AppAccountSheetProvider>
            </ViewerWalletMoodProvider>
          </ViewerProfileShellProvider>
        </AppSocialBalanceProvider>
      </AppTransactionFeedbackProvider>
    </AppWalletProvider>
  );
}
