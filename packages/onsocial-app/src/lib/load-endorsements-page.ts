import { cache } from 'react';
import type { EndorsementListItem, ProfileSearchRow } from '@onsocial/sdk';
import type {
  EndorsementPanelItem,
  EndorsementsPanelResponse,
} from '@/lib/endorsements-panel-data';
import { createAppOnSocialClient } from '@/lib/profile-social-server';

const PREVIEW_LIMIT = 24;

function profileMap(rows: ProfileSearchRow[]): Map<string, ProfileSearchRow> {
  return new Map(rows.map((row) => [row.accountId, row]));
}

function enrich(
  item: EndorsementListItem,
  profiles: Map<string, ProfileSearchRow>
): EndorsementPanelItem {
  const issuer = profiles.get(item.issuer);
  const target = profiles.get(item.target);
  return {
    ...item,
    issuerName: issuer?.name ?? null,
    issuerAvatarUrl: issuer?.avatar ?? null,
    targetName: target?.name ?? null,
    targetAvatarUrl: target?.avatar ?? null,
  };
}

/** SSR endorsements shell from indexer (same payload as the API route). */
export const loadEndorsementsPageData = cache(
  async (accountId: string): Promise<EndorsementsPanelResponse | null> => {
    const id = accountId.trim();
    if (!id) return null;
    try {
      const os = createAppOnSocialClient();
      const [bundle, receivedItems, givenItems] = await Promise.all([
        os.endorsements.previewBundle(id, { limit: PREVIEW_LIMIT }),
        os.endorsements.listReceived(id, { limit: PREVIEW_LIMIT }),
        os.endorsements.listGiven(id, { limit: PREVIEW_LIMIT }),
      ]);
      const profiles = profileMap(bundle.profiles);
      return {
        accountId: id,
        counts: bundle.counts,
        received: receivedItems.map((item) => enrich(item, profiles)),
        given: givenItems.map((item) => enrich(item, profiles)),
      };
    } catch {
      return null;
    }
  }
);
