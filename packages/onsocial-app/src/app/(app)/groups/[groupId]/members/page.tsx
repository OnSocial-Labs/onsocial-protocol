import type { Metadata } from 'next';
import { getGuildBlueprint } from '@/features/guilds/guilds-data';
import { LiveGuildMembersPanel } from '@/features/guilds/live-guild-members-panel';

type GuildMembersPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildMembersPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const guild = getGuildBlueprint(decodeURIComponent(groupId));

  return {
    title: `${guild.name} Members • OnSocial`,
    description: `Members, roles, and permissions for ${guild.name}.`,
  };
}

export default async function GuildMembersPage({
  params,
}: GuildMembersPageProps) {
  const { groupId } = await params;
  return <LiveGuildMembersPanel groupId={decodeURIComponent(groupId)} />;
}
