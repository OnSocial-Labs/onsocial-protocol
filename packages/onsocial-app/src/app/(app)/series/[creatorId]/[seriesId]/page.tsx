import { fetchCollectionsByCreator } from '@/features/scarces/collections-data';
import { fetchSeriesBrandingServer } from '@/features/scarces/series-data';
import { SeriesPagePanel } from '@/features/scarces/series-page-panel';
import { loadProfileShell } from '@/lib/profile-shell';

interface SeriesPageProps {
  params: Promise<{ creatorId: string; seriesId: string }>;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { creatorId, seriesId } = await params;
  const creator = decodeURIComponent(creatorId);
  const id = decodeURIComponent(seriesId);
  const [collections, profile, branding] = await Promise.all([
    fetchCollectionsByCreator(creator, { limit: 48 }),
    loadProfileShell(creator),
    fetchSeriesBrandingServer(creator, id),
  ]);
  const drops = collections.filter((view) => view.seriesId === id);
  return (
    <SeriesPagePanel
      creatorId={creator}
      seriesId={id}
      initialBranding={branding}
      creatorAvatarUrl={profile?.avatarUrl ?? null}
      creatorDisplayName={profile?.name ?? null}
      drops={drops}
    />
  );
}
