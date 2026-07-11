import type { Metadata } from 'next';
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
  const guild = getGuildBlueprint(decodeURIComponent(groupId));

  return {
    title: `${guild.name} Settings • OnSocial`,
    description: `Guild configuration and rollout model for ${guild.name}.`,
  };
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
