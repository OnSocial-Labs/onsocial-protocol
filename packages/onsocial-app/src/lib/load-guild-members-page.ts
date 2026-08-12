import { cache } from 'react';
import type { GroupBannedRow, GroupMemberRow } from '@onsocial/sdk';
import { reconcileGuildMemberRoster } from '@/features/guilds/guild-member-roster';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type GuildMembersPageData = {
  members: GroupMemberRow[];
  banned: GroupBannedRow[];
  memberDriven: boolean;
  ownerId: string | null;
  guildName: string | null;
};

/** SSR members roster from indexer (chain role reconcile still client). */
export const loadGuildMembersPageData = cache(
  async (groupId: string): Promise<GuildMembersPageData | null> => {
    const id = groupId.trim();
    if (!id) return null;
    try {
      const os = createServerOnSocialClient();
      const [shellRows, page, bannedPage] = await Promise.all([
        os.query.groups.byIds([id]),
        os.query.groups.membersOf(id, { limit: 120 }),
        os.query.groups.bannedOf(id, { limit: 120 }).catch(() => ({
          items: [] as GroupBannedRow[],
        })),
      ]);
      const shell = shellRows[0] ?? null;
      if (
        !shell &&
        (page.items?.length ?? 0) === 0 &&
        (bannedPage.items?.length ?? 0) === 0
      ) {
        return null;
      }
      const ownerId = shell?.ownerId?.trim() || null;
      return {
        members: reconcileGuildMemberRoster(page.items ?? [], ownerId),
        banned: bannedPage.items ?? [],
        memberDriven: Boolean(shell?.isMemberDriven),
        ownerId,
        guildName: shell?.groupName?.trim() || null,
      };
    } catch {
      return null;
    }
  }
);
