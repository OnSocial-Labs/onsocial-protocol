import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LauncherHomeLoadingScreen } from '@/components/launcher-home';
import { DaosIndexPanel } from '@/features/protocol/daos-index-panel';

export const metadata: Metadata = {
  title: 'DAOs • OnSocial',
  description: 'Your DAO memberships — create an org or open a portfolio.',
};

export default function DaosIndexPage() {
  return (
    <Suspense
      fallback={
        <LauncherHomeLoadingScreen
          title="DAOs"
          loadingLabel="Loading your DAOs…"
        />
      }
    >
      <DaosIndexPanel />
    </Suspense>
  );
}
