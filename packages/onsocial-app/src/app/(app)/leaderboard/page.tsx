import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LeaderboardRoutePanel } from '@/features/leaderboard/leaderboard-route-panel';

export const metadata: Metadata = {
  title: 'Leaderboard • OnSocial',
  description: 'Protocol reputation, influence, and earners.',
};

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardRoutePanel />
    </Suspense>
  );
}
