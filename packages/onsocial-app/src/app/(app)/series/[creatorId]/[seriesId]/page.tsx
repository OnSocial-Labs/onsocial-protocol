import { fetchCollectionsByCreator } from '@/features/scarces/collections-data';
import { SeriesPagePanel } from '@/features/scarces/series-page-panel';
import { loadProfileShell } from '@/lib/profile-shell';

interface SeriesPageProps {
  params: Promise<{ creatorId: string; seriesId: string }>;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { creatorId, seriesId } = await params;
  const creator = decodeURIComponent(creatorId);
  const id = decodeURIComponent(seriesId);
  // Indexer collections + profile shell only — brand soft-fills from chain.
  const [collections, profile] = await Promise.all([
    fetchCollectionsByCreator(creator, { limit: 48 }),
    loadProfileShell(creator),
  ]);
  const drops = collections.filter((view) => view.seriesId === id);
  return (
    <SeriesPagePanel
      creatorId={creator}
      seriesId={id}
      initialBranding={null}
      creatorAvatarUrl={profile?.avatarUrl ?? null}
      drops={drops}
    />
  );
}
