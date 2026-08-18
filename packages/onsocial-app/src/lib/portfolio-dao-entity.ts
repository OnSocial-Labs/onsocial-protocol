import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import { lookupDaoCatalogByIds } from '@/lib/dao-catalog-lookup';
import {
  enrichStandingAccountWithDaoCatalog,
  isHeuristicDaoAccountId,
} from '@/lib/enrich-standing-with-dao';
import { daoPath } from '@/lib/app-routes';

export type PortfolioDaoEntity = {
  isDao: boolean;
  /** Quiet face eyebrow — e.g. Community DAO. */
  kindLabel: string | null;
  /** Same as {@link daoPath} — `/@account` home (legacy name kept for callers). */
  workspaceHref: string | null;
};

function kindLabelForAccount(accountId: string): string {
  const id = accountId.trim().toLowerCase();
  if (id === GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase()) {
    return 'Governance DAO';
  }
  if (id === TREASURY_DAO_ACCOUNT.trim().toLowerCase()) {
    return 'Treasury DAO';
  }
  return 'DAO';
}

/**
 * Server resolve: is this `/@account` a DAO org face?
 * Heuristic suffixes + catalog hit. Used to square the crest and light org chrome.
 */
export async function resolvePortfolioDaoEntity(
  accountId: string
): Promise<PortfolioDaoEntity> {
  const id = accountId.trim().toLowerCase();
  if (!id) {
    return { isDao: false, kindLabel: null, workspaceHref: null };
  }

  if (isHeuristicDaoAccountId(id)) {
    return {
      isDao: true,
      kindLabel: kindLabelForAccount(id),
      workspaceHref: daoPath(id),
    };
  }

  const catalog = await lookupDaoCatalogByIds([id]);
  const enriched = enrichStandingAccountWithDaoCatalog(
    { accountId: id, name: null, bio: null, avatarUrl: null },
    catalog
  );

  if (!enriched.isDao) {
    return { isDao: false, kindLabel: null, workspaceHref: null };
  }

  const row = catalog.get(id);
  return {
    isDao: true,
    kindLabel: row?.name?.trim() ? 'DAO' : kindLabelForAccount(id),
    workspaceHref: daoPath(id),
  };
}
