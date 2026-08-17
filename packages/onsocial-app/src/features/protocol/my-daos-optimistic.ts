const OPTIMISTIC_MY_DAOS_KEY = 'onsocial:my-daos-optimistic';

export type OptimisticMyDao = {
  daoAccountId: string;
  roleNames: string[];
  labeledAt: number;
};

function readAll(): OptimisticMyDao[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(OPTIMISTIC_MY_DAOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const record = row as Record<string, unknown>;
        const daoAccountId =
          typeof record.daoAccountId === 'string'
            ? record.daoAccountId.trim().toLowerCase()
            : '';
        if (!daoAccountId) return null;
        const roleNames = Array.isArray(record.roleNames)
          ? record.roleNames.filter(
              (name): name is string => typeof name === 'string'
            )
          : [];
        return {
          daoAccountId,
          roleNames,
          labeledAt:
            typeof record.labeledAt === 'number' ? record.labeledAt : Date.now(),
        };
      })
      .filter((row): row is OptimisticMyDao => row != null);
  } catch {
    return [];
  }
}

function writeAll(rows: OptimisticMyDao[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(OPTIMISTIC_MY_DAOS_KEY, JSON.stringify(rows));
  } catch {
    // ignore quota / private mode
  }
}

/** Remember a DAO membership for this tab until /my-daos catches up. */
export function rememberOptimisticMyDao(opts: {
  daoAccountId: string;
  roleNames: string[];
}): void {
  const daoAccountId = opts.daoAccountId.trim().toLowerCase();
  if (!daoAccountId) return;
  const next = [
    {
      daoAccountId,
      roleNames: opts.roleNames,
      labeledAt: Date.now(),
    },
    ...readAll().filter((row) => row.daoAccountId !== daoAccountId),
  ].slice(0, 40);
  writeAll(next);
}

export function readOptimisticMyDaos(): OptimisticMyDao[] {
  return readAll();
}

export function clearOptimisticMyDao(daoAccountId: string): void {
  const id = daoAccountId.trim().toLowerCase();
  writeAll(readAll().filter((row) => row.daoAccountId !== id));
}
