import type { Metadata } from 'next';
import { CollectionPagePanel } from '@/features/scarces/collection-page-panel';
import {
  fetchCollectionCached,
  loadCollectionPageData,
} from '@/lib/load-collection-page';

type CollectionPageProps = {
  params: Promise<{ collectionId: string }>;
};

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

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { collectionId } = await params;
  const id = decodeURIComponent(collectionId);
  const { view, creator, activity } = await loadCollectionPageData(id);
  return (
    <CollectionPagePanel
      collectionId={id}
      initial={view}
      initialCreator={creator}
      initialActivity={activity}
    />
  );
}
