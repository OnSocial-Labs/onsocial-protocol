import { cache } from 'react';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export interface ProfileGuildSummary {
  groupId: string;
  name: string;
  accessGated: boolean;
  memberDriven: boolean;
  role: 'Owner' | 'Admin' | 'Moderator' | 'Member';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function roleFromMembership(row: {
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
}): ProfileGuildSummary['role'] {
  if (row.isOwner) return 'Owner';
  if (row.isAdmin) return 'Admin';
  if (row.canModerate) return 'Moderator';
  return 'Member';
}

export const fetchProfileGuilds = cache(
  async (accountId: string): Promise<ProfileGuildSummary[]> => {
    try {
      const os = createServerOnSocialClient();
      const page = await os.query.groups.membershipsBy(accountId, {
        limit: 12,
      });
      return page.items.map((row) => ({
        groupId: row.groupId,
        name: readString(row.groupName) ?? row.groupId,
        accessGated: row.isPublic === false,
        memberDriven: false,
        role: roleFromMembership(row),
      }));
    } catch {
      return [];
    }
  }
);
