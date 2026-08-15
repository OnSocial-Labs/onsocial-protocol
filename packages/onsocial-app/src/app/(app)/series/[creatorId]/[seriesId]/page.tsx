import type { Metadata } from 'next';
import { SeriesPagePanel } from '@/features/scarces/series-page-panel';
import {
  loadSeriesPageData,
  seriesPageDocumentTitle,
} from '@/lib/load-series-page';

interface SeriesPageProps {
  params: Promise<{ creatorId: string; seriesId: string }>;
}

export async function generateMetadata({
  params,
}: SeriesPageProps): Promise<Metadata> {
  const { creatorId, seriesId } = await params;
  const data = await loadSeriesPageData(
    decodeURIComponent(creatorId),
    decodeURIComponent(seriesId)
  );
  const title = seriesPageDocumentTitle(
    data.branding,
    data.drops,
    data.seriesId || decodeURIComponent(seriesId)
  );
  return {
    title: `${title} • Series • OnSocial`,
    ...(data.branding?.description
      ? { description: data.branding.description }
      : {}),
  };
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { creatorId, seriesId } = await params;
  const data = await loadSeriesPageData(
    decodeURIComponent(creatorId),
    decodeURIComponent(seriesId)
  );
  return (
    <SeriesPagePanel
      creatorId={data.creatorId}
      seriesId={data.seriesId}
      initialBranding={data.branding}
      creatorAvatarUrl={data.profile?.avatarUrl ?? null}
      creatorDisplayName={data.profile?.name ?? null}
      drops={data.drops}
    />
  );
}
