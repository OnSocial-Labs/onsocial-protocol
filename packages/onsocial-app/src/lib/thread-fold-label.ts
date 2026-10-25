import type { PostRow } from '@onsocial/sdk';
import { displayName } from '@/lib/profile-display';
import { resolvePostDate } from '@/lib/post-display';
import { parsePostMedia, postStillImages } from '@/lib/post-media';

/**
 * Contextual label for a folded stretch of a thread (the zigzag coil row).
 * Derived from the hidden posts themselves, in priority order:
 *
 * 1. Author — one author leads (`Six replies from Sam`); several authors
 *    flag the notable one (`Six replies, including Sam`) when a notable
 *    account (thread root author / followed) is in the fold.
 * 2. Media — a photo-heavy fold with no author signal
 *    (`Two replies with photos`).
 * 3. Time — daypart of the newest hidden post (`Replies from this morning`).
 *
 * Multi-author folds with nobody notable skip to media so the label never
 * names someone the reader cannot place.
 */
export function resolveThreadFoldLabel(
  hidden: readonly PostRow[],
  options: {
    /** Thread pages fold replies; feed chains fold the author's own posts. */
    noun?: 'reply' | 'post';
    /** Feed chains hide earlier posts — `Three earlier posts from Sam`. */
    earlier?: boolean;
    /** Accounts worth flagging in multi-author folds (e.g. thread root). */
    notableAccountIds?: ReadonlySet<string>;
    /** Profile display names keyed by account id. */
    profiles?: Record<string, { displayName?: string | null } | undefined>;
    /** Injectable clock (ms) for tests. */
    now?: number;
  } = {}
): string | null {
  if (hidden.length === 0) return null;
  const {
    noun = 'reply',
    earlier = false,
    notableAccountIds,
    profiles,
    now = Date.now(),
  } = options;

  const authors = new Set(hidden.map((post) => post.accountId));
  if (authors.size === 1) {
    const name = nameFor(hidden[0]!.accountId, profiles);
    return `${countWords(hidden.length)}${earlier ? ' earlier' : ''} ${plural(
      noun,
      hidden.length
    )} from ${name}`;
  }

  const notable = notableAccountIds
    ? hidden.find((post) => notableAccountIds.has(post.accountId))
    : undefined;
  if (notable) {
    const name = nameFor(notable.accountId, profiles);
    return `${countWords(hidden.length)} ${plural(
      noun,
      hidden.length
    )}, including ${name}`;
  }

  const photoCount = hidden.filter(
    (post) => postStillImages(parsePostMedia(post.value)).length > 0
  ).length;
  if (photoCount >= 2 && photoCount * 2 >= hidden.length) {
    return `${countWords(photoCount)} ${plural(
      noun,
      photoCount
    )} with ${photoCount === 1 ? 'a photo' : 'photos'}`;
  }

  const newest = hidden.reduce<number>((latest, post) => {
    const time = resolvePostDate(post.blockTimestamp)?.getTime() ?? 0;
    return time > latest ? time : latest;
  }, 0);
  if (newest > 0) {
    return `${capitalize(plural(noun, hidden.length))} from ${daypartPhrase(
      newest,
      now
    )}`;
  }

  return `${countWords(hidden.length)} more ${plural(noun, hidden.length)}`;
}

function nameFor(
  accountId: string,
  profiles?: Record<string, { displayName?: string | null } | undefined>
): string {
  return displayName(accountId, profiles?.[accountId]?.displayName);
}

function plural(noun: 'reply' | 'post', count: number): string {
  if (count === 1) return noun;
  return noun === 'reply' ? 'replies' : 'posts';
}

const COUNT_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
] as const;

function countWords(count: number): string {
  return count >= 0 && count < COUNT_WORDS.length
    ? COUNT_WORDS[count]!
    : String(count);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DAY_MS = 86_400_000;

/**
 * `this morning` / `this afternoon` / `this evening` for the same calendar
 * day, then yesterday / earlier this week / earlier this month / a while
 * back. Local calendar days — the reader's own sense of "morning".
 */
function daypartPhrase(timeMs: number, nowMs: number): string {
  const date = new Date(timeMs);
  const now = new Date(nowMs);
  const dayStart = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ageDays = Math.round((dayStart(now) - dayStart(date)) / DAY_MS);
  if (ageDays <= 0) {
    const hour = date.getHours();
    if (hour < 12) return 'this morning';
    if (hour < 17) return 'this afternoon';
    return 'this evening';
  }
  if (ageDays === 1) return 'yesterday';
  if (ageDays < 7) return 'earlier this week';
  if (ageDays < 31) return 'earlier this month';
  return 'a while back';
}
