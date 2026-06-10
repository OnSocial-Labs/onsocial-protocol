/** Sputnik DAO unit variants (e.g. Vote) may arrive as plain strings from NEAR JSON. */
export function normalizeDaoProposalKind(
  kind: unknown
): Record<string, unknown> | null {
  if (kind == null) {
    return null;
  }

  if (typeof kind === 'string') {
    const trimmed = kind.trim();
    return trimmed ? { [trimmed]: null } : null;
  }

  if (typeof kind === 'object' && !Array.isArray(kind)) {
    const record = kind as Record<string, unknown>;
    return Object.keys(record).length > 0 ? record : null;
  }

  return null;
}

export function getDaoProposalKindName(kind: unknown): string | null {
  if (typeof kind === 'string') {
    const trimmed = kind.trim();
    return trimmed || null;
  }

  if (kind && typeof kind === 'object' && !Array.isArray(kind)) {
    return Object.keys(kind as Record<string, unknown>)[0] ?? null;
  }

  return null;
}
