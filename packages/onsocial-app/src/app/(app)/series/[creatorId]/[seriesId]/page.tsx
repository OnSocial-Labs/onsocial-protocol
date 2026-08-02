import { fetchCollectionsByCreator } from '@/features/scarces/collections-data';
import { fetchSeriesBranding } from '@/features/scarces/series-data';
import { SeriesPagePanel } from '@/features/scarces/series-page-panel';
import { loadProfileShell } from '@/lib/profile-shell';

interface SeriesPageProps {
  params: Promise<{ creatorId: string; seriesId: string }>;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { creatorId, seriesId } = await params;
  const creator = decodeURIComponent(creatorId);
  const id = decodeURIComponent(seriesId);
  const [branding, collections, profile] = await Promise.all([
    fetchSeriesBranding(creator, id),
    fetchCollectionsByCreator(creator, { limit: 48 }),
    loadProfileShell(creator),
  ]);
  const drops = collections.filter((view) => view.seriesId === id);
  return (
    <SeriesPagePanel
      creatorId={creator}
      seriesId={id}
      initialBranding={branding}
      creatorAvatarUrl={profile?.avatarUrl ?? null}
      drops={drops}
    />
  );
}
