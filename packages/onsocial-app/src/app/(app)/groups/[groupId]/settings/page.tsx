import { redirect } from 'next/navigation';
import { guildSheetPath } from '@/features/guilds/guilds-data';

type GuildSettingsPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

/** Legacy `/settings` deep links → live settings hub on the guild home. */
export default async function GuildSettingsPage({
  params,
}: GuildSettingsPageProps) {
  const { groupId } = await params;
  redirect(guildSheetPath(decodeURIComponent(groupId), 'settings'));
}
