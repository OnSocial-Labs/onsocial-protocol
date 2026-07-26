import type { Metadata } from 'next';
import { fetchApp } from '@/features/scarces/apps-data';
import { AppPagePanel } from '@/features/scarces/app-page-panel';

type AppPageProps = {
  params: Promise<{ appId: string }>;
};

export async function generateMetadata({
  params,
}: AppPageProps): Promise<Metadata> {
  const { appId } = await params;
  const id = decodeURIComponent(appId);
  const view = await fetchApp(id);
  if (!view) {
    return { title: 'Store • OnSocial' };
  }
  return {
    title: `${view.title} • Store • OnSocial`,
    ...(view.description ? { description: view.description } : {}),
  };
}

export default async function AppPage({ params }: AppPageProps) {
  const { appId } = await params;
  const id = decodeURIComponent(appId);
  const view = await fetchApp(id);
  return <AppPagePanel appId={id} initial={view} />;
}
