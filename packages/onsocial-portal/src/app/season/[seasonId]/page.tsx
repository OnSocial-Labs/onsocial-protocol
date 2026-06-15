'use client';

import { use } from 'react';
import { SeasonRallyPage } from '@/features/season/season-zero-page';

export default function SeasonByIdPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = use(params);
  return <SeasonRallyPage seasonId={decodeURIComponent(seasonId)} />;
}
