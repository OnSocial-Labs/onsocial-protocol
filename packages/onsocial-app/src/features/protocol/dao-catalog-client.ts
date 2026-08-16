const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export type DaoCatalogEntry = {
  daoAccountId: string;
  name: string | null;
  purpose: string | null;
  source: string;
  listedAt: string;
};

export type DaoCatalogResponse = {
  q: string | null;
  limit: number;
  offset: number;
  total: number;
  daos: DaoCatalogEntry[];
  factoryAccountId: string;
  indexedCount: number;
  factoryCount: number;
  syncing: boolean;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** Browse / search the factory-backed Sputnik DAO catalog. */
export async function fetchDaoCatalog(opts: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<DaoCatalogResponse> {
  const search = new URLSearchParams();
  const q = opts.q?.trim() ?? '';
  if (q) search.set('q', q);
  if (opts.limit != null) search.set('limit', String(opts.limit));
  if (opts.offset != null) search.set('offset', String(opts.offset));

  const body = await readJson<{
    success?: boolean;
    q?: string | null;
    limit?: number;
    offset?: number;
    total?: number;
    daos?: DaoCatalogEntry[];
    factoryAccountId?: string;
    indexedCount?: number;
    factoryCount?: number;
    syncing?: boolean;
    error?: string;
  }>(
    await fetch(`/api/governance/daos?${search.toString()}`, {
      cache: 'no-store',
    })
  );

  if (body.success === false) {
    throw new Error(body.error || 'DAO catalog unavailable.');
  }

  return {
    q: body.q ?? (q || null),
    limit: body.limit ?? opts.limit ?? 20,
    offset: body.offset ?? opts.offset ?? 0,
    total: body.total ?? 0,
    daos: Array.isArray(body.daos) ? body.daos : [],
    factoryAccountId: body.factoryAccountId ?? '',
    indexedCount: body.indexedCount ?? 0,
    factoryCount: body.factoryCount ?? 0,
    syncing: Boolean(body.syncing),
  };
}

export function isLikelyDaoAccountId(value: string): boolean {
  return ACCOUNT_ID_PATTERN.test(value.trim().toLowerCase());
}
