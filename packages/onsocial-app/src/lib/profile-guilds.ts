import { cache } from 'react';
import {
  enrichGuildSummaryCards,
  guildSummaryCardFromMembership,
} from '@/features/guilds/guild-facts';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type ProfileGuildSummary = GuildSummaryCardModel & {
  role: NonNullable<GuildSummaryCardModel['role']>;
};

export const fetchProfileGuilds = cache(
  async (accountId: string): Promise<ProfileGuildSummary[]> => {
    try {
      const os = createServerOnSocialClient();
      const page = await os.query.groups.membershipsBy(accountId, {
        limit: 12,
      });
      const cards = page.items.map((row) => {
        const card = guildSummaryCardFromMembership(row);
        return {
          ...card,
          role: card.role ?? 'Member',
        } satisfies ProfileGuildSummary;
      });
      const enriched = await enrichGuildSummaryCards(os, cards);
      return enriched.map((card) => ({
        ...card,
        role: card.role ?? 'Member',
      }));
    } catch {
      return [];
    }
  }
);
