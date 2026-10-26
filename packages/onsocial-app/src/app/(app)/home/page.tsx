import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { Suspense } from 'react';
import {
  HOME_FEED_COLD_SKELETON_FRAMES,
  PostRowSkeleton,
} from '@/features/home/post-card';
import { parseHomeFeedFocus } from '@/features/home/home-feed-focus';
import { HomeFeedRoute } from '@/features/home/home-feed-route';
import { shouldSeedHomeFeedPage } from '@/features/home/home-feed-speculative';
import { loadHomeFeedPage } from '@/lib/load-home-feed-page';
import {
  HOME_FEED_SESSION_HINT_COOKIE,
  homeFeedSessionHintPresent,
} from '@/lib/home-feed-session';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

type HomePageProps = {
  searchParams?: Promise<{
    tag?: string | string[];
    ticker?: string | string[];
    place?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * A full load renders the public hot page into the feed session slot.
 * Opening Home from inside the app seeds only when no saved list is marked.
 * A saved list still wins, including the line you left. A focused URL skips
 * the hot seed.
 */
export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <Suspense
      fallback={
        <PostRowSkeleton rows={4} frames={HOME_FEED_COLD_SKELETON_FRAMES} />
      }
    >
      <HomeFeedSeed searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeFeedSeed({
  searchParams,
}: {
  searchParams: HomePageProps['searchParams'];
}) {
  const resolved = await searchParams;
  const focus = parseHomeFeedFocus({
    tag: firstParam(resolved?.tag),
    ticker: firstParam(resolved?.ticker),
    place: firstParam(resolved?.place),
  });
  const rscHeader = (await headers()).get('rsc');
  const savedList = (await cookies()).get(HOME_FEED_SESSION_HINT_COOKIE)?.value;
  const paint = shouldSeedHomeFeedPage({
    rscHeader,
    hasFocus: focus != null,
    hasSavedList: homeFeedSessionHintPresent(savedList),
  })
    ? await loadHomeFeedPage()
    : null;
  return <HomeFeedRoute paint={paint} />;
}
