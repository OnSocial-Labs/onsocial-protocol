import type { Metadata } from 'next';
import { fetchAppsDirectory } from '@/features/scarces/apps-data';
import { AppsDirectoryPanel } from '@/features/scarces/apps-directory-panel';
import { APPS_PAGE_SIZE } from '@/features/scarces/apps-directory';

export const metadata: Metadata = {
  title: 'Hubs • OnSocial',
  description: 'Creator hubs publishing drops on OnSocial.',
};

export default async function AppsPage() {
  const page = await fetchAppsDirectory({
    limit: APPS_PAGE_SIZE,
    hideTest: true,
    sort: 'recent',
  });
  return <AppsDirectoryPanel initial={page.apps} />;
}
