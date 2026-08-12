import type { Metadata } from 'next';
import { TicketDoorPagePanel } from '@/features/scarces/ticket-door-page-panel';
import { fetchCollectionCached } from '@/lib/load-collection-page';

type RedeemPageProps = {
  params: Promise<{ collectionId: string }>;
};

export async function generateMetadata({
  params,
}: RedeemPageProps): Promise<Metadata> {
  const { collectionId } = await params;
  const id = decodeURIComponent(collectionId);
  const view = await fetchCollectionCached(id);
  if (!view) {
    return { title: 'Redeem • OnSocial' };
  }
  return {
    title: `Redeem · ${view.title} • OnSocial`,
  };
}

export default async function CollectionRedeemPage({ params }: RedeemPageProps) {
  const { collectionId } = await params;
  const id = decodeURIComponent(collectionId);
  const view = await fetchCollectionCached(id);
  return (
    <TicketDoorPagePanel collectionId={id} initial={view} voice="redeem" />
  );
}
