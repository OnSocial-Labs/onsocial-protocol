import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';

export type { PortfolioDaoEntity } from '@/lib/load-dao-page';
export {
  loadDaoPageData,
  loadPortfolioDaoContext,
  loadPortfolioDaoContextWithProfile,
  resolvePortfolioDaoEntity,
} from '@/lib/load-dao-page';

/** Protocol Governance ↔ Treasury pair — face kind line is a switch, not a static label. */
export function isProtocolFacePairDao(accountId: string): boolean {
  const id = accountId.trim().toLowerCase();
  return (
    id === GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase() ||
    id === TREASURY_DAO_ACCOUNT.trim().toLowerCase()
  );
}

export function isProtocolGovernanceFace(accountId: string): boolean {
  return (
    accountId.trim().toLowerCase() ===
    GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase()
  );
}

export function isProtocolTreasuryFace(accountId: string): boolean {
  return (
    accountId.trim().toLowerCase() ===
    TREASURY_DAO_ACCOUNT.trim().toLowerCase()
  );
}

export type ProtocolFaceDaoKind = 'governance' | 'treasury';

/** Protocol Governance / Treasury faces — config ids only, no RPC. */
export function resolveProtocolFaceDaoKind(
  accountId: string
): ProtocolFaceDaoKind | null {
  if (isProtocolGovernanceFace(accountId)) return 'governance';
  if (isProtocolTreasuryFace(accountId)) return 'treasury';
  return null;
}
