import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { CollectionRouteSlot } from '@/features/scarces/collection-route-slot';
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
  // Soft open is DropLayerSheet + native history. A Next soft flight still
  // hits this route for metadata — do not mount a second panel or await
  // full page data under the sheet.
  if (headerList.get('next-url')) {
    return null;
  }
  const query = await searchParams;
  const hint = walletAccountHintFromCookie(
    jar.get(APP_WALLET_ACCOUNT_HINT_COOKIE)?.value
  );
  const holdSeed = dropHoldHintForCollection(
    jar.get(APP_DROP_HOLD_HINT_COOKIE)?.value,
    hint,
    id
  );
  const { view, creator, activity } = await loadCollectionPageData(id);
  return (
    <CollectionRouteSlot
      collectionId={id}
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
