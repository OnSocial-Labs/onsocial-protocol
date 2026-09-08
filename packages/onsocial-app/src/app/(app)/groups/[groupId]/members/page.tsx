import { redirect } from 'next/navigation';
import { guildSheetPath } from '@/features/guilds/guilds-data';

type GuildMembersPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

/** Legacy `/members` deep links → live members sheet on the guild home. */
export default async function GuildMembersPage({
  params,
}: GuildMembersPageProps) {
  const { groupId } = await params;
  redirect(guildSheetPath(decodeURIComponent(groupId), 'members'));
}
