import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OsAppChromePage, OsAppChromePageStatus } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CommunityHandoffPanel } from '@/features/community/community-handoff-panel';
import { APP_HOME_PATH } from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'Continue • OnSocial',
  description:
    'Continue to a listed Community dapp with your OnSocial account.',
};

function HandoffFallback() {
  return (
    <OsAppScreen title="Continue" backFallbackHref={APP_HOME_PATH} glassChrome>
      <OsAppChromePage>
        <OsAppChromePageStatus>Loading…</OsAppChromePageStatus>
      </OsAppChromePage>
    </OsAppScreen>
  );
}

export default function CommunityHandoffPage() {
  return (
    <Suspense fallback={<HandoffFallback />}>
      <CommunityHandoffPanel />
    </Suspense>
  );
}
