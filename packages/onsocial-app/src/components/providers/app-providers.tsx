'use client';

import { AppSocialBalanceProvider } from '@/contexts/app-social-balance-context';
import { AppRewardsProvider } from '@/contexts/app-rewards-context';
import { Suspense } from 'react';
import {
  AppAccountSheetHost,
  AppAccountSheetProvider,
  WalletSheetDeepLink,
} from '@/contexts/app-account-sheet-context';
import { CollectiblesNowPlayingProvider } from '@/contexts/collectibles-now-playing-context';
import { AppTransactionFeedbackProvider } from '@/contexts/app-transaction-feedback-context';
import { AppWalletProvider } from '@/contexts/app-wallet-context';
import { SeasonParticipationProvider } from '@/contexts/season-participation-context';
import {
  RallySheetDeepLink,
  RallySheetProvider,
} from '@/features/rally/rally-sheet-host';
import { ComposeLauncherProvider } from '@/contexts/compose-launcher-context';
import { DockChromeProvider } from '@/contexts/dock-chrome-context';
import {
  OsPortalHostProvider,
  useOsPortalHost,
} from '@/contexts/os-portal-host-context';
import { PortfolioCustomizeProvider } from '@/contexts/portfolio-customize-context';
import { ViewerProfileShellProvider } from '@/contexts/viewer-profile-shell-context';
import { ViewerWalletMoodProvider } from '@/contexts/viewer-wallet-mood-context';
import { DropComposeHost } from '@/features/scarces/drop-compose-host';
import { ViewerMuteBlockHost } from '@/components/providers/viewer-mute-block-host';
import { DmUnreadHost } from '@/components/providers/dm-unread-host';
import { NotificationsHost } from '@/components/providers/notifications-host';
import { PwaProvider } from '@/components/providers/pwa-provider';
import { WebPushProvider } from '@/components/providers/web-push-provider';
import { GlassSheetPortalProvider } from '@onsocial/ui';

/** Clip GlassSheet frost to the live OS / portfolio card (same host as slide-overs). */
function OsGlassSheetPortalBridge({ children }: { children: React.ReactNode }) {
  const host = useOsPortalHost();
  return (
    <GlassSheetPortalProvider container={host}>
      {children}
    </GlassSheetPortalProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PwaProvider>
      <AppWalletProvider>
        <AppTransactionFeedbackProvider>
          <SeasonParticipationProvider>
          <AppSocialBalanceProvider>
            <ViewerProfileShellProvider>
              <ViewerWalletMoodProvider>
                <AppAccountSheetProvider>
                  <AppRewardsProvider>
                    <PortfolioCustomizeProvider>
                      <ComposeLauncherProvider>
                        <DockChromeProvider>
                        <OsPortalHostProvider>
                          <OsGlassSheetPortalBridge>
                            <RallySheetProvider>
                            <CollectiblesNowPlayingProvider>
                              <DmUnreadHost>
                                <NotificationsHost>
                                  <WebPushProvider>
                                    {children}
                                    <ViewerMuteBlockHost />
                                    <DropComposeHost />
                                    <Suspense fallback={null}>
                                      <WalletSheetDeepLink />
                                      <RallySheetDeepLink />
                                    </Suspense>
                                    <AppAccountSheetHost />
                                  </WebPushProvider>
                                </NotificationsHost>
                              </DmUnreadHost>
                            </CollectiblesNowPlayingProvider>
                            </RallySheetProvider>
                          </OsGlassSheetPortalBridge>
                        </OsPortalHostProvider>
                        </DockChromeProvider>
                      </ComposeLauncherProvider>
                    </PortfolioCustomizeProvider>
                  </AppRewardsProvider>
                </AppAccountSheetProvider>
              </ViewerWalletMoodProvider>
            </ViewerProfileShellProvider>
          </AppSocialBalanceProvider>
          </SeasonParticipationProvider>
        </AppTransactionFeedbackProvider>
      </AppWalletProvider>
    </PwaProvider>
  );
}
