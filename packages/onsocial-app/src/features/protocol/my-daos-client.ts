const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export type MyDaoMembership = {
  daoAccountId: string;
  roleNames: string[];
  updatedAt: string;
};

export type MyDaosResponse = {
  accountId: string;
  daos: MyDaoMembership[];
  indexedDaoAccountIds: string[];
};

function assertAccountId(accountId: string): string {
  const id = accountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(id)) {
    throw new Error('Invalid account id.');
  }
  return id;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** DB-backed membership list — indexed Group roles only. */
export async function fetchMyDaos(accountId: string): Promise<MyDaosResponse> {
  const id = assertAccountId(accountId);
  const search = new URLSearchParams({ accountId: id });
  const body = await readJson<{
    success?: boolean;
    accountId?: string;
    daos?: MyDaoMembership[];
    indexedDaoAccountIds?: string[];
    error?: string;
  }>(
    await fetch(`/api/governance/my-daos?${search.toString()}`, {
      cache: 'no-store',
    })
  );
  if (body.success === false) {
    throw new Error(body.error || 'My DAOs unavailable.');
  }
  return {
    accountId: body.accountId?.trim() || id,
    daos: Array.isArray(body.daos) ? body.daos : [],
    indexedDaoAccountIds: Array.isArray(body.indexedDaoAccountIds)
      ? body.indexedDaoAccountIds
      : [],
  };
}

/** Soft-index membership for a DAO (portfolio / board open). */
export function softIndexDaoMemberships(daoAccountId: string): void {
  const id = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(id)) return;
  const search = new URLSearchParams({ daoAccountId: id });
  void fetch(`/api/governance/policy?${search.toString()}`, {
    cache: 'no-store',
  }).catch(() => {
    // ignore — membership index is best-effort
  });
}
