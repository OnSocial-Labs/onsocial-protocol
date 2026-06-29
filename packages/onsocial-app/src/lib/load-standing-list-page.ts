import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import {
  createAppOnSocialClient,
  listStandingAccountsPage,
  STANDING_PAGE_SIZE,
} from '@/lib/profile-social-server';
import type {
  StandingAccountSummary,
  StanceDetailKind,
} from '@/lib/profile-social-standings';

export interface StandingInitialList {
  accounts: StandingAccountSummary[];
  total: number;
  hasMore: boolean;
  counts?: { incoming: number; outgoing: number; mutual: number };
}

export async function loadStandingListPage(
  accountId: string,
  kind: StanceDetailKind,
  query = ''
): Promise<StandingInitialList | null> {
  try {
    const os = createAppOnSocialClient();
    const normalizedQuery = normalizeProfileSearchQuery(query);
    const page = await listStandingAccountsPage(
      os,
      accountId,
      kind,
      null,
      STANDING_PAGE_SIZE,
      0,
      isProfileSearchQuery(normalizedQuery) ? normalizedQuery : undefined
    );

    return {
      accounts: page.accounts.map((account) => ({
        ...account,
        bio: account.bio ?? null,
      })),
      total: page.total,
      hasMore: page.hasMore,
      ...(page.counts ? { counts: page.counts } : {}),
    };
  } catch {
    return null;
  }
}
