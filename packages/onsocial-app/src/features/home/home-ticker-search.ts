import { APP_HOME_PATH } from '@/lib/app-routes';

/** Query key for Home ticker filter (`/home?ticker=social`). */
export const HOME_TICKER_QUERY_KEY = 'ticker';

const TICKER_SLUG_RE = /^[a-z][a-z0-9_]{0,15}$/;
/** `$SOCIAL`, `$near` — letter-led so `$100` is ignored. */
const TICKER_IN_TEXT_RE =
  /(?<![a-zA-Z0-9_])\$([a-zA-Z][a-zA-Z0-9_]{0,15})\b/g;

/** Normalize typed search into a ticker slug (no `$`, lowercase). */
export function normalizeTickerQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\$+/, '');
}

export function isValidTickerSlug(slug: string): boolean {
  return TICKER_SLUG_RE.test(slug);
}

/** Display form for UI chips / body links. */
export function formatTickerDisplay(slug: string): string {
  return `$${slug.toUpperCase()}`;
}

/** Home feed filtered to one indexed ticker. */
export function homeTickerPath(ticker: string): string {
  const slug = normalizeTickerQuery(ticker);
  if (!slug || !isValidTickerSlug(slug)) return APP_HOME_PATH;
  return `${APP_HOME_PATH}?${HOME_TICKER_QUERY_KEY}=${encodeURIComponent(slug)}`;
}

/** Read `?ticker=` from the Home URL. */
export function parseHomeTickerParam(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const slug = normalizeTickerQuery(raw);
  return slug && isValidTickerSlug(slug) ? slug : null;
}

/**
 * Pull unique lowercase tickers from post body for indexed `tickers[]`.
 * Bare `$SOCIAL` in text becomes `social`.
 */
export function extractTickersFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  TICKER_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TICKER_IN_TEXT_RE.exec(text)) !== null) {
    const slug = match[1]!.toLowerCase();
    if (!isValidTickerSlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    found.push(slug);
  }
  return found;
}

/** Commit on Enter only when the draft is a full valid ticker. */
export function parseTickerCommit(raw: string): string | null {
  const slug = normalizeTickerQuery(raw);
  if (!slug || !isValidTickerSlug(slug)) return null;
  return slug;
}

export function homeTickerEmptyCopy(ticker: string): string {
  return `No posts about ${formatTickerDisplay(ticker)} yet.`;
}
