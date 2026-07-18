// ---------------------------------------------------------------------------
// builders/rich-text — segment # / $ / @ / urls for bios and posts
// ---------------------------------------------------------------------------

const HASHTAG_IN_TEXT_RE = /#([a-zA-Z0-9_]{1,64})\b/g;
const TICKER_IN_TEXT_RE = /(?<![a-zA-Z0-9_])\$([a-zA-Z][a-zA-Z0-9_]{0,15})\b/g;
const MENTION_IN_TEXT_RE =
  /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})(?![a-zA-Z0-9._-])/g;
/**
 * http(s) or www. — still validated: host must include a TLD of 2+ letters
 * (so `www.o` / `https://x.i` stay plain until `.co` / `.io` / `.id`…).
 */
const SCHEMED_OR_WWW_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
/**
 * Bare host.tld (/path…) — TLD allowlist (2+ letters). Skip .near / .testnet.
 */
const BARE_DOMAIN_URL_RE =
  /(?<![@./\w])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|id|app|dev|xyz|co|me|ai|gg|tv|info|edu|gov|uk|us|ca|de|fr|jp|au|nl|se|ch)(?:\/[^\s<>"'`]*)?/gi;
const URL_TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

/** NEAR account suffixes — never treat as website TLDs. */
const BLOCKED_AUTOLINK_TLDS = new Set(['near', 'testnet']);

const HASHTAG_SLUG_RE = /^[a-z0-9_]{1,64}$/;
const TICKER_SLUG_RE = /^[a-z][a-z0-9_]{0,15}$/;
const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export type RichTextSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; slug: string }
  | { type: 'ticker'; value: string; slug: string }
  | { type: 'mention'; value: string; accountId: string }
  | { type: 'url'; value: string; href: string };

type MatchHit = {
  index: number;
  length: number;
  segment: Exclude<RichTextSegment, { type: 'text' }>;
};

function overlapsHit(hits: MatchHit[], index: number, length: number): boolean {
  const end = index + length;
  return hits.some((hit) => index < hit.index + hit.length && end > hit.index);
}

/** Peel prose punctuation stuck to the URL without eating a trailing slash. */
function peelTrailingPunct(raw: string): string {
  let value = raw.trim();
  while (value.length > 0 && URL_TRAILING_PUNCT_RE.test(value)) {
    value = value.replace(URL_TRAILING_PUNCT_RE, '');
  }
  return value;
}

/**
 * Require a real site host: at least `label.tld` with tld length ≥ 2 letters.
 * Blocks incomplete typing (`www.o`, `www.onsocial`, `onsocial.`) and NEAR-like
 * suffixes. `www.` alone needs a further label + tld (`www.onsocial.id`).
 */
export function isAutolinkableHostname(hostname: string): boolean {
  const host = hostname.replace(/\.$/, '').toLowerCase();
  if (!host.includes('.')) return false;
  const parts = host.split('.');
  if (parts.length < 2 || parts.some((part) => part.length === 0)) {
    return false;
  }
  // www.label is not enough — wait for www.label.tld
  if (parts[0] === 'www' && parts.length < 3) {
    return false;
  }
  const tld = parts[parts.length - 1]!;
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return false;
  if (BLOCKED_AUTOLINK_TLDS.has(tld)) return false;
  return true;
}

/**
 * Normalize a matched URL token to an http(s) href.
 * Accepts `https://…`, `www.…`, and bare `host.tld` / `host.tld/path`.
 * `value` in segments stays the peeled original text for compose mirror sync.
 */
export function normalizeAutolinkUrl(raw: string): string | null {
  const value = peelTrailingPunct(raw);
  if (!value) return null;

  const hadScheme = /^https?:\/\//i.test(value);
  const withScheme = hadScheme ? value : `https://${value.replace(/^\/+/, '')}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!isAutolinkableHostname(parsed.hostname)) {
      return null;
    }
    // Keep typed https://… as-is; only synthesize scheme for www./bare hosts.
    return hadScheme ? value : withScheme;
  } catch {
    return null;
  }
}

/** Hostname label for autolink chips — `https://www.onsocial.id/` → `onsocial.id`. */
export function autolinkDisplayHost(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, '');
    return host || href;
  } catch {
    return href;
  }
}

function isValidMentionAccountId(accountId: string): boolean {
  return (
    accountId.length >= 2 &&
    accountId.length <= 64 &&
    NEAR_ACCOUNT_RE.test(accountId)
  );
}

function collectUrlHits(text: string, hits: MatchHit[]): void {
  const pushUrl = (match: RegExpExecArray) => {
    const raw = peelTrailingPunct(match[0]!);
    if (!raw) return;
    const href = normalizeAutolinkUrl(raw);
    if (!href) return;
    if (overlapsHit(hits, match.index, raw.length)) return;
    hits.push({
      index: match.index,
      length: raw.length,
      segment: { type: 'url', value: raw, href },
    });
  };

  SCHEMED_OR_WWW_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCHEMED_OR_WWW_URL_RE.exec(text)) !== null) {
    pushUrl(match);
  }

  BARE_DOMAIN_URL_RE.lastIndex = 0;
  while ((match = BARE_DOMAIN_URL_RE.exec(text)) !== null) {
    pushUrl(match);
  }
}

/**
 * Split free text into plain + protocol tokens (# / $ / @) and urls.
 * URLs win over overlapping hashtags (e.g. `https://x.com/#topics`).
 */
export function splitRichText(text: string): RichTextSegment[] {
  if (!text) return [{ type: 'text', value: '' }];

  const hits: MatchHit[] = [];
  collectUrlHits(text, hits);

  let match: RegExpExecArray | null;

  HASHTAG_IN_TEXT_RE.lastIndex = 0;
  while ((match = HASHTAG_IN_TEXT_RE.exec(text)) !== null) {
    const slug = match[1]!.toLowerCase();
    if (!HASHTAG_SLUG_RE.test(slug)) continue;
    if (overlapsHit(hits, match.index, match[0]!.length)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: { type: 'hashtag', value: match[0]!, slug },
    });
  }

  TICKER_IN_TEXT_RE.lastIndex = 0;
  while ((match = TICKER_IN_TEXT_RE.exec(text)) !== null) {
    const slug = match[1]!.toLowerCase();
    if (!TICKER_SLUG_RE.test(slug)) continue;
    if (overlapsHit(hits, match.index, match[0]!.length)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: { type: 'ticker', value: match[0]!, slug },
    });
  }

  MENTION_IN_TEXT_RE.lastIndex = 0;
  while ((match = MENTION_IN_TEXT_RE.exec(text)) !== null) {
    const accountId = match[1]!.toLowerCase().replace(/^@+/, '');
    if (!isValidMentionAccountId(accountId)) continue;
    if (overlapsHit(hits, match.index, match[0]!.length)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: {
        type: 'mention',
        value: match[0]!,
        accountId,
      },
    });
  }

  hits.sort((a, b) => a.index - b.index || b.length - a.length);

  const segments: RichTextSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.index < cursor) continue;
    if (hit.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, hit.index) });
    }
    segments.push(hit.segment);
    cursor = hit.index + hit.length;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}
