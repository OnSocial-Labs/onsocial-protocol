import type { Metadata } from 'next';
import { fetchApps } from '@/features/scarces/apps-data';
import { AppsDirectoryPanel } from '@/features/scarces/apps-directory-panel';

export const metadata: Metadata = {
  title: 'Stores • OnSocial',
  description: 'Branded storefronts publishing drops on OnSocial.',
};

export default async function AppsPage() {
  const apps = await fetchApps({ limit: 60 });
  return <AppsDirectoryPanel initial={apps} />;
}
