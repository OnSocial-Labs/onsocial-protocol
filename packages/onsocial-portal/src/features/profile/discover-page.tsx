'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import {
  ProfileDiscoveryPanel,
  ProfileDiscoverySearchRail,
} from '@/features/profile/profile-discovery-panel';
import { useProfile } from '@/contexts/profile-context';
import { useWallet } from '@/contexts/wallet-context';
import { useNavBack } from '@/hooks/use-nav-back';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';
import {
  profilePageDiscoverColumnClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
import { getPortalProfileUrl } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

export default function DiscoverPage() {
  const router = useRouter();
  const { accountId } = useWallet();
  const profileState = useProfile();
  const [query, setQuery] = useState('');

  useNavBack('Back');
  usePageNavBadge('Discover', 'blue');

  const handleSelectAccount = useCallback(
    (targetAccountId: string) => {
      router.push(getPortalProfileUrl(targetAccountId));
    },
    [router]
  );

  return (
    <PageShell size="form" className="px-0">
      <div
        className={cn('w-full min-w-0', profilePageMobileGutterClass)}
      >
        <div
          className={cn(
            'flex flex-col gap-4 pb-12',
            profilePageDiscoverColumnClass
          )}
        >
          <ProfileDiscoverySearchRail
            query={query}
            onQueryChange={setQuery}
            autoFocus
          />

          <ProfileDiscoveryPanel
            layout="page"
            viewerAccountId={accountId}
            hasSocialSession={profileState.hasSocialSession}
            query={query}
            onQueryChange={setQuery}
            showSearch={false}
            onSelectAccount={handleSelectAccount}
            onUpdateStanding={
              accountId ? profileState.updateStanding : undefined
            }
          />
        </div>
      </div>
    </PageShell>
  );
}
