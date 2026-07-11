'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { GuildEditSheet } from '@/features/guilds/guild-edit-sheet';
import { GuildRoomsSheet } from '@/features/guilds/guild-rooms-sheet';
import { guildPath } from '@/features/guilds/guilds-data';

/**
 * Deep-link host for `/groups/[id]/settings`.
 * Primary edit UX is the GlassSheet stack from the guild gear hub;
 * this route opens the same sheets and returns to the guild home on close.
 */
export function LiveGuildSettingsPanel({
  groupId,
  section = 'edit',
}: {
  groupId: string;
  section?: 'edit' | 'rooms';
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(section === 'edit');
  const [roomsOpen, setRoomsOpen] = useState(section === 'rooms');

  const returnToGuild = () => {
    router.replace(guildPath(groupId));
  };

  return (
    <OsAppScreen
      title="Guild settings"
      subtitle="Edit identity and rooms from the sheet."
      backFallbackHref={guildPath(groupId)}
    >
      <GuildEditSheet
        open={editOpen}
        groupId={groupId}
        onClose={() => {
          setEditOpen(false);
          returnToGuild();
        }}
      />
      <GuildRoomsSheet
        open={roomsOpen}
        groupId={groupId}
        onClose={() => {
          setRoomsOpen(false);
          returnToGuild();
        }}
      />
    </OsAppScreen>
  );
}
