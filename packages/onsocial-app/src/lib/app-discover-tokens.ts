import { SOCIAL_TOKEN_CONTRACT } from '@/lib/app-config';
import { accountIdsEqual } from '@/lib/account-match';
import {
  getNearAccountInputError,
  isNearAccountInputReady,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { isFtAdminFor, isFtAdminLocked } from '@/lib/app-create-token';
import { WRAP_NEAR_TOKEN_ID } from '@/lib/token-metadata';

export const DISCOVER_TOKEN_PROBE_CAP = 16;

const PROTOCOL_FT_IDS = new Set([
  SOCIAL_TOKEN_CONTRACT.trim().toLowerCase(),
  WRAP_NEAR_TOKEN_ID,
  'wrap.testnet',
]);

export function normalizeTokenContractId(value: string): string {
  return normalizeNearAccountId(value);
}

/** `cool.alice.near` is Alice's child. `alice.near` is not a child of `near`. */
export function isFtChildAccount(
  contractId: string,
  parentId: string
): boolean {
  const contract = normalizeTokenContractId(contractId);
  const parent = normalizeTokenContractId(parentId);
  if (!contract || !parent || !parent.includes('.')) return false;
  const suffix = `.${parent}`;
  return contract.endsWith(suffix) && contract.length > suffix.length;
}

export function isProtocolListedToken(contractId: string): boolean {
  return PROTOCOL_FT_IDS.has(normalizeTokenContractId(contractId));
}

export function getAddTokenAccountError(value: string): string {
  return getNearAccountInputError(value);
}

export function isAddTokenAccountReady(value: string): boolean {
  return isNearAccountInputReady(value);
}

/**
 * A token they created — still owner, or a locked child under their account.
 * Not SOCIAL / wNEAR. Not a random holding.
 */
export function isDiscoverableCreatorToken(params: {
  contractId: string;
  viewerId: string;
  ownerId?: string | null;
}): boolean {
  const contractId = normalizeTokenContractId(params.contractId);
  const viewerId = normalizeTokenContractId(params.viewerId);
  if (!contractId || !viewerId) return false;
  if (isProtocolListedToken(contractId)) return false;
  if (accountIdsEqual(contractId, viewerId)) return false;

  const owner = params.ownerId?.trim() ? params.ownerId : null;
  if (isFtAdminFor(owner, viewerId)) return true;
  if (isFtChildAccount(contractId, viewerId)) {
    return (
      owner == null || isFtAdminLocked(owner) || isFtAdminFor(owner, viewerId)
    );
  }
  return false;
}

export function getAddTokenOwnershipError(params: {
  contractId: string;
  viewerId: string;
  ownerId?: string | null;
  hasMetadata: boolean;
}): string {
  if (!params.hasMetadata) return 'That is not a token.';
  if (isProtocolListedToken(params.contractId)) {
    return 'SOCIAL already lives in your wallet.';
  }
  if (
    isDiscoverableCreatorToken({
      contractId: params.contractId,
      viewerId: params.viewerId,
      ownerId: params.ownerId,
    })
  ) {
    return '';
  }
  return 'That token is not yours.';
}

export function uniqueTokenContractIds(
  ids: readonly string[],
  cap = DISCOVER_TOKEN_PROBE_CAP
): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of ids) {
    const id = normalizeTokenContractId(raw);
    if (!id || seen.has(id) || isProtocolListedToken(id)) continue;
    seen.add(id);
    next.push(id);
    if (next.length >= cap) break;
  }
  return next;
}
