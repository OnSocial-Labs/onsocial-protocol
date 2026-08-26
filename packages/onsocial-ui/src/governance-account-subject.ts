export type GovernanceAccountSubjectKind = 'person' | 'infrastructure';

const INFRASTRUCTURE_EYEBROWS = new Set(['Contract', 'Boost', 'From']);

/** Common first segments for DAO / protocol system accounts (any network). */
const INFRASTRUCTURE_LOCAL_NAMES = new Set([
  'boost',
  'core',
  'governance',
  'rewards',
  'scarces',
  'social-spend',
  'staking',
  'staking-governance',
  'staking-treasury',
  'token',
  'treasury',
]);

/** Human title when no social profile — first account segment, hyphen/underscore → words. */
export function formatNearAccountFallbackTitle(accountId: string): string {
  const trimmed = accountId.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return 'Implicit account';
  }

  const local = trimmed.split('.')[0]?.trim() ?? trimmed;
  if (!local) {
    return trimmed;
  }

  return local
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeAccountId(
  accountId: string | null | undefined
): string | null {
  const value = accountId?.trim().toLowerCase();
  return value || null;
}

/** Heuristic for contract / DAO infra accounts without relying on a managed list. */
export function looksLikeInfrastructureAccount(
  accountId: string | null | undefined
): boolean {
  const normalized = normalizeAccountId(accountId);
  if (!normalized || /^[0-9a-f]{64}$/i.test(normalized)) {
    return false;
  }

  const local = normalized.split('.')[0] ?? normalized;
  if (!local) {
    return false;
  }

  if (INFRASTRUCTURE_LOCAL_NAMES.has(local)) {
    return true;
  }

  // Hyphenated slugs are usually contracts (social-spend, staking-governance).
  return local.includes('-');
}

/** Role class for governance / protocol account chips without a social profile. */
export function resolveGovernanceAccountSubjectKind({
  subjectEyebrow,
  targetKind,
  subjectAccount,
  targetAccountId,
}: {
  subjectEyebrow?: string | null;
  targetKind?: string | null;
  subjectAccount?: string | null;
  targetAccountId?: string | null;
}): GovernanceAccountSubjectKind {
  const eyebrow = subjectEyebrow?.trim();
  if (eyebrow && INFRASTRUCTURE_EYEBROWS.has(eyebrow)) {
    return 'infrastructure';
  }

  const subject = normalizeAccountId(subjectAccount);
  const targetAccount = normalizeAccountId(targetAccountId);
  if (
    targetKind === 'contract' &&
    subject &&
    targetAccount &&
    subject === targetAccount
  ) {
    return 'infrastructure';
  }

  // Transfer / ownership "To" can be a person or treasury — use account shape.
  if (looksLikeInfrastructureAccount(subject)) {
    return 'infrastructure';
  }

  return 'person';
}
