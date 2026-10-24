import type { Metadata } from 'next';
import { CollectionPagePanel } from '@/features/scarces/collection-page-panel';
import { COLLECTION_PASS_TOKEN_PARAM } from '@/lib/app-routes';
import {
  fetchCollectionCached,
  loadCollectionPageData,
} from '@/lib/load-collection-page';

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
  const query = await searchParams;
  const { view, creator, activity } = await loadCollectionPageData(id);
  return (
    <CollectionPagePanel
      collectionId={id}
      initial={view}
      initialCreator={creator}
      initialActivity={activity}
      initialEditionToken={
        firstParam(query[COLLECTION_PASS_TOKEN_PARAM]) || null
      }
    />
  );
}
