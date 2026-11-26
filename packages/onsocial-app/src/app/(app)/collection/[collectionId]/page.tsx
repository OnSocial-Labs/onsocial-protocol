import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { CollectionRouteSlot } from '@/features/scarces/drop-place-instant-host';
import { COLLECTION_PASS_TOKEN_PARAM } from '@/lib/app-routes';
import {
  fetchCollectionCached,
  loadCollectionPageData,
} from '@/lib/load-collection-page';
import {
  APP_DROP_HOLD_HINT_COOKIE,
  dropHoldHintForCollection,
} from '@/lib/drop-hold-hint';
import {
  APP_WALLET_ACCOUNT_HINT_COOKIE,
  walletAccountHintFromCookie,
} from '@/lib/wallet-account-hint';

type CollectionPageProps = {
  params: Promise<{ collectionId: string }>;
  searchParams: Promise<{
    [COLLECTION_PASS_TOKEN_PARAM]?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() || '';
  return value?.trim() || '';
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { collectionId } = await params;
  const id = decodeURIComponent(collectionId);
  const view = await fetchCollectionCached(id);
  if (!view) {
    return { title: 'Drop • OnSocial' };
  }
  return {
    title: `${view.title} • Drop • OnSocial`,
    ...(view.description ? { description: view.description } : {}),
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const { collectionId } = await params;
  const id = decodeURIComponent(collectionId);
  const jar = await cookies();
  const headerList = await headers();
  // `rsc` is stripped from userland headers(). `next-url` is the client
  // navigation signal and stays visible. The slot still receives the full
  // payload so a cached flight can paint on back/forward.
  const yieldToHost = Boolean(headerList.get('next-url'));
  const query = await searchParams;
  const { view, creator, activity } = await loadCollectionPageData(id);
  const hint = walletAccountHintFromCookie(
    jar.get(APP_WALLET_ACCOUNT_HINT_COOKIE)?.value
  );
  const holdSeed = dropHoldHintForCollection(
    jar.get(APP_DROP_HOLD_HINT_COOKIE)?.value,
    hint,
    id
  );
  return (
    <CollectionRouteSlot
      collectionId={id}
      yieldToHost={yieldToHost}
      initial={view}
      initialCreator={creator}
      initialActivity={activity}
      initialViewerAccountId={hint}
      initialHoldSeed={holdSeed}
      initialEditionToken={
        firstParam(query[COLLECTION_PASS_TOKEN_PARAM]) || null
      }
    />
  );
}
