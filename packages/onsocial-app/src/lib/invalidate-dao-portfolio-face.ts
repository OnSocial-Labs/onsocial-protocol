/**
 * Client caches for DAO portfolio face (name / crest / cover).
 * Call before `router.refresh()` after ChangeConfig or OnSocial profile execute.
 */

import { invalidateDaoBrandingCache } from '@/lib/dao-shell-cache';

export function invalidateDaoPortfolioFaceCaches(daoAccountId: string): void {
  invalidateDaoBrandingCache(daoAccountId);
}
