import type { Metadata } from 'next';
import { LeaderboardRoutePanel } from '@/features/leaderboard/leaderboard-route-panel';
import {
  LEADERBOARD_TRACK_PARAM,
  parseLeaderboardTrackParam,
} from '@/lib/app-routes';
import type { LeaderboardTrack } from '@/lib/leaderboard';

export const metadata: Metadata = {
  title: 'Leaderboard • OnSocial',
  description: 'Protocol reputation, influence, and earners.',
};

type LeaderboardPageProps = {
  searchParams: Promise<{
    [LEADERBOARD_TRACK_PARAM]?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LeaderboardPage({
  searchParams,
}: LeaderboardPageProps) {
  const params = await searchParams;
  const initialTrack = parseLeaderboardTrackParam(
    firstParam(params[LEADERBOARD_TRACK_PARAM])
  ) as LeaderboardTrack;

  return <LeaderboardRoutePanel initialTrack={initialTrack} />;
}
