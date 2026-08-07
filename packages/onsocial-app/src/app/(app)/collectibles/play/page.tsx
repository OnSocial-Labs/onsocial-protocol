import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CollectiblesPlayLoadingScreen } from '@/features/collectibles/collectibles-play-loading-screen';
import { CollectiblesPlayPanel } from '@/features/collectibles/collectibles-play-panel';
import {
  COLLECTIBLES_PLAY_PARAM,
  COLLECTIBLES_PLAY_TOKEN_PARAM,
} from '@/lib/app-routes';
import { loadCollectiblesPlayData } from '@/lib/load-collection-page';

export const metadata: Metadata = {
  title: 'Player • Collectibles • OnSocial',
  description: 'Play music and video from your Collectibles vault.',
};

type CollectiblesPlayPageProps = {
  searchParams: Promise<{
    [COLLECTIBLES_PLAY_PARAM]?: string | string[];
    collection?: string | string[];
    [COLLECTIBLES_PLAY_TOKEN_PARAM]?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() || '';
  return value?.trim() || '';
}

export default async function CollectiblesPlayPage({
  searchParams,
}: CollectiblesPlayPageProps) {
  const sp = await searchParams;
  const collectionId =
    firstParam(sp[COLLECTIBLES_PLAY_PARAM]) || firstParam(sp.collection);
  const tokenId = firstParam(sp[COLLECTIBLES_PLAY_TOKEN_PARAM]);
  const initial =
    collectionId.length > 0
      ? await loadCollectiblesPlayData(collectionId)
      : { view: null, creator: null };

  return (
    <Suspense fallback={<CollectiblesPlayLoadingScreen />}>
      <CollectiblesPlayPanel
        initialCollectionId={collectionId || null}
        initialTokenId={tokenId || null}
        initialView={initial.view}
        initialCreator={initial.creator}
      />
    </Suspense>
  );
}
