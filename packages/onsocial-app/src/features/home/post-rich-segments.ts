import {
  normalizeHashtagQuery,
} from '@/features/home/home-hashtag-search';
import {
  isValidTickerSlug,
  normalizeTickerQuery,
} from '@/features/home/home-ticker-search';
import {
  isValidMentionAccountId,
  normalizeMentionAccountId,
  type ActiveMentionQuery,
} from '@/features/home/post-mentions';

const HASHTAG_IN_TEXT_RE = /#([a-zA-Z0-9_]{1,64})\b/g;
const TICKER_IN_TEXT_RE =
  /(?<![a-zA-Z0-9_])\$([a-zA-Z][a-zA-Z0-9_]{0,15})\b/g;
const MENTION_IN_TEXT_RE =
  /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})(?![a-zA-Z0-9._-])/g;

export type PostRichSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'ticker'; value: string; slug: string }
  | { type: 'mention'; value: string; accountId: string };

type MatchHit = {
  index: number;
  length: number;
  segment: Exclude<PostRichSegment, { type: 'text' }>;
};

/** Segment body text for composer highlight + feed links (# / $ / @). */
export function splitPostRichText(text: string): PostRichSegment[] {
  if (!text) return [{ type: 'text', value: '' }];

  const hits: MatchHit[] = [];

  HASHTAG_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_IN_TEXT_RE.exec(text)) !== null) {
    const slug = normalizeHashtagQuery(match[1]!);
    if (!slug) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: { type: 'hashtag', value: match[0]! },
    });
  }

  TICKER_IN_TEXT_RE.lastIndex = 0;
  while ((match = TICKER_IN_TEXT_RE.exec(text)) !== null) {
    const slug = normalizeTickerQuery(match[1]!);
    if (!isValidTickerSlug(slug)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: { type: 'ticker', value: match[0]!, slug },
    });
  }

  MENTION_IN_TEXT_RE.lastIndex = 0;
  while ((match = MENTION_IN_TEXT_RE.exec(text)) !== null) {
    const accountId = normalizeMentionAccountId(match[1]!);
    if (!isValidMentionAccountId(accountId)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: { type: 'mention', value: match[0]!, accountId },
    });
  }

  hits.sort((a, b) => a.index - b.index || b.length - a.length);

  const segments: PostRichSegment[] = [];
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

/**
 * Composer backdrop: same as feed, plus green highlight for the in-progress
 * `@query` even when it is not yet a complete account id (`@green`).
 */
export function splitComposerRichText(
  text: string,
  active: ActiveMentionQuery | null
): PostRichSegment[] {
  if (!active) return splitPostRichText(text);

  const mentionValue = text.slice(active.start, active.end);
  if (!mentionValue.startsWith('@')) return splitPostRichText(text);

  const before = text.slice(0, active.start);
  const after = text.slice(active.end);
  const accountId = normalizeMentionAccountId(mentionValue);

  const segments: PostRichSegment[] = [];
  if (before) segments.push(...splitPostRichText(before));
  segments.push({
    type: 'mention',
    value: mentionValue,
    accountId: isValidMentionAccountId(accountId) ? accountId : '',
  });
  if (after) segments.push(...splitPostRichText(after));
  return segments.length > 0 ? segments : [{ type: 'text', value: '' }];
}
