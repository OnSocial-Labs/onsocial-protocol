import type { GroupBannedRow, GroupMemberRow } from '@onsocial/sdk';

/** Adapt banned indexer rows into roster row shape for shared member list UI. */
export function bannedRowsAsMemberRows(
  banned: GroupBannedRow[],
  groupId: string
): GroupMemberRow[] {
  return banned.map((row) => ({
    groupId: row.groupId || groupId,
    memberId: row.memberId,
    role: null,
    level: 0,
    isOwner: false,
    isAdmin: false,
    canModerate: false,
    blockHeight: row.blockHeight,
    blockTimestamp: row.blockTimestamp,
  }));
}
