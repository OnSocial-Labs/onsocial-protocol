import type { Metadata } from 'next';
import { TicketDoorPagePanel } from '@/features/scarces/ticket-door-page-panel';
import { fetchCollectionCached } from '@/lib/load-collection-page';

type DoorPageProps = {
  params: Promise<{ collectionId: string }>;
};

export async function generateMetadata({
  params,
}: DoorPageProps): Promise<Metadata> {
  const { collectionId } = await params;
  const id = decodeURIComponent(collectionId);
  const view = await fetchCollectionCached(id);
  if (!view) {
    return { title: 'Admit • OnSocial' };
  }
  return {
    title: `Admit · ${view.title} • OnSocial`,
  };
}

export default async function CollectionDoorPage({ params }: DoorPageProps) {
  const { collectionId } = await params;
  const id = decodeURIComponent(collectionId);
  const view = await fetchCollectionCached(id);
  return (
    <TicketDoorPagePanel collectionId={id} initial={view} voice="admit" />
  );
}
