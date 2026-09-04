import {
  extractHashtagsFromText,
} from '@/features/home/home-hashtag-search';
import { extractTickersFromText } from '@/features/home/home-ticker-search';
import {
  isNearNamedAccountComplete,
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

type MentionToken = {
  start: number;
  end: number;
  value: string;
  accountId: string;
};

/** Normalize a typed / extracted mention to a lowercase account id (no `@`). */
export function normalizeMentionAccountId(raw: string): string {
  return normalizeNearAccountId(raw.replace(/^@+/, ''));
}

/** Shape-valid NEAR id (may still be incomplete while typing). */
export function isValidMentionAccountId(accountId: string): boolean {
  return isValidNearAccountId(accountId);
}

/**
 * True mention for highlight + link — named account on this network
 * (`.testnet` / `.near` / `.tg`), not bare `@alice`.
 */
export function isCompleteMentionAccountId(accountId: string): boolean {
  return isNearNamedAccountComplete(accountId);
}

function collectMentionTokens(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  MENTION_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_IN_TEXT_RE.exec(text)) !== null) {
    const value = match[0]!;
    const accountId = normalizeMentionAccountId(match[1]!);
    tokens.push({
      start: match.index,
      end: match.index + value.length,
      value,
      accountId,
    });
  }
  return tokens;
}

function removeTokenRanges(
  text: string,
  ranges: Array<{ start: number; end: number }>
): string {
  if (ranges.length === 0) return text;
  const ordered = [...ranges].sort((a, b) => b.start - a.start);
  let next = text;
  for (const range of ordered) {
    const before = next.slice(0, range.start);
    const after = next.slice(range.end);
    // Drop a single leftover space so "hi @bad there" → "hi there".
    if (before.endsWith(' ') && after.startsWith(' ')) {
      next = `${before}${after.slice(1)}`;
    } else if (before.endsWith(' ') && after.length === 0) {
      next = before.trimEnd();
    } else {
      next = `${before}${after}`;
    }
  }
  return next;
}

/**
 * Drop closed `@tokens` that are not complete named accounts.
 * Leaves an in-progress `@query` at `caret` alone when provided.
 */
export function stripIncompleteMentions(
  text: string,
  caret?: number
): string {
  const active =
    caret != null ? findActiveMentionQuery(text, caret) : null;
  const bad = collectMentionTokens(text).filter((token) => {
    if (active && token.start === active.start) return false;
    return !isCompleteMentionAccountId(token.accountId);
  });
  return removeTokenRanges(
    text,
    bad.map((token) => ({ start: token.start, end: token.end }))
  );
}

/**
 * Keep only mentions that are complete + known-good (picker) or exist on-chain.
 * Incomplete / missing accounts are removed from the string.
 */
export async function sanitizeMentionsInText(
  text: string,
  exists: (accountId: string) => Promise<boolean>,
  trustedAccountIds?: ReadonlySet<string>
): Promise<string> {
  const withoutIncomplete = stripIncompleteMentions(text);
  const tokens = collectMentionTokens(withoutIncomplete);
  if (tokens.length === 0) return withoutIncomplete;

  const remove: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    if (trustedAccountIds?.has(token.accountId)) continue;
    let ok = false;
    try {
      ok = await exists(token.accountId);
    } catch {
      ok = false;
    }
    if (!ok) {
      remove.push({ start: token.start, end: token.end });
    }
  }
  return removeTokenRanges(withoutIncomplete, remove);
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
    if (!isCompleteMentionAccountId(accountId) || seen.has(accountId)) continue;
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
