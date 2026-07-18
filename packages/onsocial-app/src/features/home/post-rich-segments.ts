import {
  autolinkDisplayHost,
  normalizeAutolinkUrl,
  splitRichText,
  type RichTextSegment,
} from '@onsocial/sdk';
import {
  isValidMentionAccountId,
  normalizeMentionAccountId,
  type ActiveMentionQuery,
} from '@/features/home/post-mentions';

export { autolinkDisplayHost, normalizeAutolinkUrl };

/** App segment shape — hashtag keeps `value` for display; slug optional via SDK. */
export type PostRichSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'ticker'; value: string; slug: string }
  | { type: 'mention'; value: string; accountId: string }
  | { type: 'url'; value: string; href: string };

function toPostSegment(segment: RichTextSegment): PostRichSegment {
  if (segment.type === 'hashtag') {
    return { type: 'hashtag', value: segment.value };
  }
  return segment;
}

/** Segment body text for composer highlight + feed links (# / $ / @ / urls). */
export function splitPostRichText(text: string): PostRichSegment[] {
  return splitRichText(text).map(toPostSegment);
}

/**
 * Composer backdrop: same as feed, plus highlight for the in-progress
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
