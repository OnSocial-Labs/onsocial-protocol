import {
  MARKET_MEDIUM_FILTERS,
  parseMarketMediumFilter,
  type MarketMediumFilter,
} from '@/features/market/market-medium';

/** Edge-safe copy of `vaultHeldKindFilters` — middleware must not import SDK. */
function heldKindFilters(
  items: ReadonlyArray<{ mediumKind: string | null | undefined }>,
  selected: MarketMediumFilter = 'all'
): MarketMediumFilter[] {
  const held = new Set<MarketMediumFilter>();
  for (const item of items) {
    const kind = parseMarketMediumFilter(item.mediumKind);
    if (kind !== 'all') held.add(kind);
  }
  if (selected !== 'all') held.add(selected);
  return MARKET_MEDIUM_FILTERS.map((entry) => entry.id).filter(
    (id) => id === 'all' || held.has(id)
  );
}

/** Last vault's held kinds — middleware copies this onto the loading shell. */
export const COLLECTIBLES_HELD_KINDS_COOKIE = 'onsocial-collectibles-held';

export const COLLECTIBLES_SEARCH_HEADER = 'x-collectibles-search';
export const COLLECTIBLES_ACCOUNT_HEADER = 'x-collectibles-account';
export const COLLECTIBLES_HELD_KINDS_HEADER = 'x-collectibles-held-kinds';

export function serializeCollectiblesHeldKinds(
  accountId: string,
  kinds: readonly MarketMediumFilter[]
): string {
  const owner = accountId.trim().toLowerCase();
  const held = kinds.filter((id) => id !== 'all');
  return `${owner}|${held.join(',')}`;
}

export function parseCollectiblesHeldKindsCookie(
  raw: string | null | undefined,
  accountId: string
): MarketMediumFilter[] | null {
  const owner = accountId.trim().toLowerCase();
  if (!raw || !owner) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const sep = decoded.indexOf('|');
  if (sep < 0) return null;
  const cookieOwner = decoded.slice(0, sep).trim().toLowerCase();
  if (cookieOwner !== owner) return null;
  const list = decoded.slice(sep + 1);
  const mediums = list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((mediumKind) => ({ mediumKind }));
  return heldKindFilters(mediums, 'all');
}

/** Cookie value for `name` from a `document.cookie` (or Cookie header) string. */
export function cookieValueFromCookieSource(
  cookieSource: string | null | undefined,
  name: string
): string | null {
  if (!cookieSource) return null;
  for (const part of cookieSource.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1);
    }
  }
  return null;
}

/** Vault account on `/@id/collectibles` — not OS `/collectibles` or play/read. */
export function collectiblesVaultAccountFromPathname(
  pathname: string
): string | null {
  if (pathname === '/collectibles' || pathname === '/collectibles/') {
    return null;
  }
  const match = pathname.match(/^\/(@[^/]+)\/collectibles\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/^@/, '').trim() || null;
  } catch {
    return match[1].replace(/^@/, '').trim() || null;
  }
}

/** Persist held kinds so the next hard refresh paints the same one-row rail. */
export function rememberCollectiblesHeldKinds(
  accountId: string,
  items: ReadonlyArray<{ mediumKind: string | null | undefined }>
): void {
  const owner = accountId.trim();
  if (!owner || typeof document === 'undefined') return;
  const kinds = heldKindFilters(items, 'all');
  const value = encodeURIComponent(
    serializeCollectiblesHeldKinds(owner, kinds)
  );
  try {
    document.cookie = `${COLLECTIBLES_HELD_KINDS_COOKIE}=${value}; path=/; max-age=2592000; samesite=lax`;
  } catch {
    /* private mode */
  }
}
