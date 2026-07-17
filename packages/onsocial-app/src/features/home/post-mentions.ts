import {
  extractHashtagsFromText,
} from '@/features/home/home-hashtag-search';
import { extractTickersFromText } from '@/features/home/home-ticker-search';
import {
  isValidNearAccountId,
  normalizeNearAccountId,
} from '@/lib/app-near-account';

/**
 * Mentions in post body: `@alice.testnet`, `@bob.near`.
 * Lookbehind skips email-like `user@host`. Trailing account chars stop the match.
 */
const MENTION_IN_TEXT_RE =
  /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})(?![a-zA-Z0-9._-])/g;

export type ActiveMentionQuery = {
  /** Index of `@`. */
  start: number;
  /** Caret index (end of typed query). */
  end: number;
  /** Text after `@` (may be empty while the picker is open). */
  query: string;
};

/** Normalize a typed / extracted mention to a lowercase account id (no `@`). */
export function normalizeMentionAccountId(raw: string): string {
  return normalizeNearAccountId(raw.replace(/^@+/, ''));
}

export function isValidMentionAccountId(accountId: string): boolean {
  return isValidNearAccountId(accountId);
}

/**
 * Pull unique account ids from `@mentions` in post body for schema `mentions[]`.
 */
export function extractMentionsFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  MENTION_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_IN_TEXT_RE.exec(text)) !== null) {
    const accountId = normalizeMentionAccountId(match[1]!);
    if (!isValidMentionAccountId(accountId) || seen.has(accountId)) continue;
    seen.add(accountId);
    found.push(accountId);
  }
  return found;
}

/** Hashtags + tickers + mentions for PostV1 write / optimistic JSON. */
export function postMetaFromText(text: string): {
  hashtags?: string[];
  tickers?: string[];
  mentions?: string[];
} {
  const hashtags = extractHashtagsFromText(text);
  const tickers = extractTickersFromText(text);
  const mentions = extractMentionsFromText(text);
  return {
    ...(hashtags.length > 0 ? { hashtags } : {}),
    ...(tickers.length > 0 ? { tickers } : {}),
    ...(mentions.length > 0 ? { mentions } : {}),
  };
}

/**
 * Active `@query` at the caret for composer autocomplete.
 * Returns null when the caret is not inside a mention token.
 */
export function findActiveMentionQuery(
  text: string,
  caret: number
): ActiveMentionQuery | null {
  if (caret < 0 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && /[a-zA-Z0-9._-]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (!/^[a-zA-Z0-9._-]*$/.test(query)) return null;
  if (query.length > 64) return null;
  return { start: at, end: caret, query };
}

/** Replace the active `@query` with `@accountId` (trailing space when needed). */
export function insertMentionAt(
  text: string,
  active: Pick<ActiveMentionQuery, 'start' | 'end'>,
  accountId: string
): { text: string; caret: number } {
  const normalized = normalizeMentionAccountId(accountId);
  const mention = `@${normalized}`;
  const after = text.slice(active.end);
  // Space before the next word/token; keep punctuation tight (`@alice!`).
  const needsSpace = after.length === 0 || /^[a-zA-Z0-9_]/.test(after);
  const insertion = needsSpace ? `${mention} ` : mention;
  const next = `${text.slice(0, active.start)}${insertion}${after}`;
  return { text: next, caret: active.start + insertion.length };
}
