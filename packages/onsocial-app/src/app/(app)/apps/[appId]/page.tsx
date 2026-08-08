import type { Metadata } from 'next';
import { AppPagePanel } from '@/features/scarces/app-page-panel';
import { loadAppPageData } from '@/lib/load-app-page';

type AppPageProps = {
  params: Promise<{ appId: string }>;
};

export async function generateMetadata({
  params,
}: AppPageProps): Promise<Metadata> {
  const { appId } = await params;
  const id = decodeURIComponent(appId);
  const { app } = await loadAppPageData(id);
  if (!app) {
    return { title: 'Hub • OnSocial' };
  }
  return {
    title: `${app.title} • Hub • OnSocial`,
    ...(app.description ? { description: app.description } : {}),
  };
}

export default async function AppPage({ params }: AppPageProps) {
  const { appId } = await params;
  const id = decodeURIComponent(appId);
  const { app, stats, drops } = await loadAppPageData(id);
  return (
    <AppPagePanel
      appId={id}
      initial={app}
      initialStats={stats}
      initialDrops={drops}
    />
  );
}
