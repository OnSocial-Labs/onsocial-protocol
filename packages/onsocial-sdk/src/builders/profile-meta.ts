// ---------------------------------------------------------------------------
// builders/profile-meta — extract # / $ / @ from profile bio (mirrors posts)
// ---------------------------------------------------------------------------

/** Matches `#NEAR`, `#gm_1` in free text (schema: lowercase a-z0-9_). */
const HASHTAG_IN_TEXT_RE = /#([a-zA-Z0-9_]{1,64})\b/g;
/** `$SOCIAL`, `$near` — letter-led so `$100` is ignored. */
const TICKER_IN_TEXT_RE = /(?<![a-zA-Z0-9_])\$([a-zA-Z][a-zA-Z0-9_]{0,15})\b/g;
/**
 * Mentions: `@alice.testnet`, `@bob.near`.
 * Lookbehind skips email-like `user@host`.
 */
const MENTION_IN_TEXT_RE =
  /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})(?![a-zA-Z0-9._-])/g;

const HASHTAG_SLUG_RE = /^[a-z0-9_]{1,64}$/;
const TICKER_SLUG_RE = /^[a-z][a-z0-9_]{0,15}$/;
/** Minimal NEAR account id check (same spirit as app mention validation). */
const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const MENTION_ROOT_SUFFIXES = ['.near', '.testnet', '.tg'] as const;

function isIndexedMentionAccountId(accountId: string): boolean {
  if (
    !accountId ||
    accountId.length < 2 ||
    accountId.length > 64 ||
    !NEAR_ACCOUNT_RE.test(accountId)
  ) {
    return false;
  }
  if (/^[a-f0-9]{64}$/.test(accountId)) return true;
  return MENTION_ROOT_SUFFIXES.some((suffix) => accountId.endsWith(suffix));
}

export interface ProfileBioMeta {
  hashtags: string[];
  tickers: string[];
  mentions: string[];
}

function uniqueLowerSlugs(
  text: string,
  re: RegExp,
  isValid: (slug: string) => boolean
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const slug = match[1]!.toLowerCase();
    if (!isValid(slug) || seen.has(slug)) continue;
    seen.add(slug);
    found.push(slug);
  }
  return found;
}

function extractMentions(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  MENTION_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_IN_TEXT_RE.exec(text)) !== null) {
    const accountId = match[1]!.toLowerCase().replace(/^@+/, '');
    if (!isIndexedMentionAccountId(accountId) || seen.has(accountId)) {
      continue;
    }
    seen.add(accountId);
    found.push(accountId);
  }
  return found;
}

/**
 * Pull unique hashtags / tickers / mentions from bio text for profile fields.
 * Always returns arrays (empty when none) so callers can clear stale values.
 */
export function profileMetaFromBio(bio: string): ProfileBioMeta {
  const text = bio ?? '';
  return {
    hashtags: uniqueLowerSlugs(text, HASHTAG_IN_TEXT_RE, (s) =>
      HASHTAG_SLUG_RE.test(s)
    ),
    tickers: uniqueLowerSlugs(text, TICKER_IN_TEXT_RE, (s) =>
      TICKER_SLUG_RE.test(s)
    ),
    mentions: extractMentions(text),
  };
}
