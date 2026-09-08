import type { Metadata } from 'next';
import { guildDocumentCopy } from '@/features/guilds/guild-card-display';
import { getGuildBlueprint } from '@/features/guilds/guilds-data';
import { GuildSettingsPanel } from '@/features/guilds/guilds-panels';

type GuildSettingsPageProps = {
  params: Promise<{
    groupId: string;
  }>;
  searchParams: Promise<{
    section?: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildSettingsPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const id = decodeURIComponent(groupId);
  const { title, description } = guildDocumentCopy(
    getGuildBlueprint(id).name,
    id,
    'Settings',
    (name) => `Guild configuration and rollout model for ${name}.`
  );
  return { title, description };
}

export default async function GuildSettingsPage({
  params,
  searchParams,
}: GuildSettingsPageProps) {
  const { groupId } = await params;
  const { section } = await searchParams;
  return (
    <GuildSettingsPanel
      groupId={decodeURIComponent(groupId)}
      section={section === 'rooms' ? 'rooms' : 'edit'}
    />
  );
}
