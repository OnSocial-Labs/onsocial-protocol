import {
  applyIndexedMemberCounts,
  guildSummaryCardFromBrowse,
} from '@/features/guilds/guild-facts';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

/** Public guild browse shell for SSR first paint (indexer only — no RPC). */
export async function loadGuildsIndexPage(): Promise<
  GuildSummaryCardModel[] | null
> {
  try {
    const os = createServerOnSocialClient();
    const { items } = await os.query.groups.browse({
      publicOnly: true,
      limit: 24,
    });
    const cards = items.map((row) => guildSummaryCardFromBrowse(row));
    if (cards.length === 0) return cards;

    try {
      const counts = await os.query.groups.memberCountsFor(
        cards.map((card) => card.groupId)
      );
      return applyIndexedMemberCounts(cards, counts);
    } catch {
      return cards;
    }
  } catch {
    return null;
  }
}
