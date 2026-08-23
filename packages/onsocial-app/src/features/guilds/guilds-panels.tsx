import { LiveGuildSettingsPanel } from '@/features/guilds/live-guild-settings-panel';
import { LiveGuildsIndexPanel } from '@/features/guilds/live-guilds-index-panel';

export function GuildsIndexPanel() {
  return <LiveGuildsIndexPanel />;
}

export function GuildSettingsPanel({
  groupId,
  section = 'edit',
}: {
  groupId: string;
  section?: 'edit' | 'rooms';
}) {
  return <LiveGuildSettingsPanel groupId={groupId} section={section} />;
}
