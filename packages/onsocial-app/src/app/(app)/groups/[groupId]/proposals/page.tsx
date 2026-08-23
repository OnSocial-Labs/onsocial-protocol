import { redirect } from 'next/navigation';
import { guildSheetPath } from '@/features/guilds/guilds-data';

type GuildProposalsPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

/** Legacy `/proposals` deep links → live proposals sheet on the guild home. */
export default async function GuildProposalsPage({
  params,
}: GuildProposalsPageProps) {
  const { groupId } = await params;
  redirect(guildSheetPath(decodeURIComponent(groupId), 'proposals'));
}
