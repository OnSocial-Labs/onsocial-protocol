/**
 * Where a guild post was opened from. The card repeats only the context
 * the previous screen did not already show.
 */
export type ThreadSheetContext = {
  guildId?: string | null;
  /** Specific room already on screen. Empty means all rooms, or no room. */
  roomId?: string | null;
};

export function guildThreadCardContext(input: {
  groupId: string;
  postChannel?: string | null;
  openedFrom?: ThreadSheetContext | null;
}): { showGuildLine: boolean; showChannel: boolean } {
  const hasChannel = Boolean(input.postChannel?.trim());
  const fromGuild = input.openedFrom?.guildId?.trim() || null;
  const sameGuild = fromGuild != null && fromGuild === input.groupId;
  if (!sameGuild) {
    return { showGuildLine: true, showChannel: hasChannel };
  }
  const roomId = input.openedFrom?.roomId?.trim() || null;
  const insideOneRoom = roomId != null && roomId !== 'all';
  return {
    showGuildLine: false,
    showChannel: hasChannel && !insideOneRoom,
  };
}
