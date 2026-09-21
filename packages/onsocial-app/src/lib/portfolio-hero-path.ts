import { isHeuristicDaoAccountId } from '@/lib/enrich-standing-with-dao';
import {
  EMPTY_PORTFOLIO_DAO_CONTEXT,
  loadPortfolioDaoContextWithProfile,
  type PortfolioDaoContext,
} from '@/lib/load-dao-page';
import type { AppProfileShell } from '@/lib/profile-shell';

/**
 * Sputnik / protocol DAO org chrome must SSR so the face cannot flash
 * person → org. Person-shaped ids skip the governance catalog hop.
 */
export function portfolioHeroAwaitsDaoContext(accountId: string): boolean {
  return isHeuristicDaoAccountId(accountId);
}

/**
 * Logged-out DAO stand count lives on the identity row, so heuristic DAO
 * faces still wait for signals. Person pages stream them.
 */
export function portfolioHeroAwaitsSignals(accountId: string): boolean {
  return isHeuristicDaoAccountId(accountId);
}

export async function loadPortfolioHeroDaoContext(
  accountId: string,
  profileShell: AppProfileShell | null
): Promise<PortfolioDaoContext> {
  if (!portfolioHeroAwaitsDaoContext(accountId)) {
    return EMPTY_PORTFOLIO_DAO_CONTEXT;
  }
  return loadPortfolioDaoContextWithProfile(accountId, profileShell);
}
