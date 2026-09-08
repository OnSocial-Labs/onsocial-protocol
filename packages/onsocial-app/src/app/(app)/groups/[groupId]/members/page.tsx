import type { Metadata } from 'next';
import { guildDocumentCopy } from '@/features/guilds/guild-card-display';
import { getGuildBlueprint } from '@/features/guilds/guilds-data';
import { LiveGuildMembersPanel } from '@/features/guilds/live-guild-members-panel';
import { loadGuildMembersPageData } from '@/lib/load-guild-members-page';

type GuildMembersPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildMembersPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const id = decodeURIComponent(groupId);
  const initial = await loadGuildMembersPageData(id);
  const { title, description } = guildDocumentCopy(
    initial?.guildName ?? getGuildBlueprint(id).name,
    id,
    'Members',
    (name) => `Members, roles, and permissions for ${name}.`
  );
  return { title, description };
}

export default async function GuildMembersPage({
  params,
}: GuildMembersPageProps) {
  const { groupId } = await params;
  const id = decodeURIComponent(groupId);
  const initial = await loadGuildMembersPageData(id);
  return <LiveGuildMembersPanel groupId={id} initial={initial} />;
}
