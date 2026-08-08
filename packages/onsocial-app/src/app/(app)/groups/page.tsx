import type { Metadata } from 'next';
import { GuildsIndexPanel } from '@/features/guilds/guilds-panels';
import { loadGuildsIndexPage } from '@/lib/load-guilds-index-page';

export const metadata: Metadata = {
  title: 'Guilds • OnSocial',
  description:
    'Collaborative OnSocial spaces with feeds, membership, roles, and optional governance.',
};

export default async function GuildsPage() {
  const initialGuilds = await loadGuildsIndexPage();
  return <GuildsIndexPanel initialGuilds={initialGuilds} />;
}
