import type { ProfileAboutAlign } from '@onsocial/sdk';
import type {
  ComposerDropDraft,
  ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { normalizeArticleTitle } from '@/lib/article-post-payload';
import { normalizePlaceSlug } from '@/lib/post-place';

export type ComposerBeat = {
  text: string;
  pollEnabled: boolean;
  pollOptions: string[];
  pollDurationMs?: number;
  drop: ComposerDropDraft | null;
  files: File[];
  contentWarning: string;
  nsfw: boolean;
  placeDraft: string;
  placeOpen: boolean;
  /** Post compose mode flip — title field shows only when true. */
  articleMode: boolean;
  articleTitle: string;
  articleAlign: ProfileAboutAlign;
};

export function emptyComposerBeat(
  seed?: Partial<
    Pick<ComposerBeat, 'text' | 'files' | 'drop' | 'articleMode' | 'articleTitle'>
  >
): ComposerBeat {
  return {
    text: seed?.text ?? '',
    pollEnabled: false,
    pollOptions: ['', ''],
    pollDurationMs: undefined,
    drop: seed?.drop ?? null,
    files: seed?.files ? [...seed.files] : [],
    contentWarning: '',
    nsfw: false,
    placeDraft: '',
    placeOpen: false,
    articleMode: seed?.articleMode ?? false,
    articleTitle: seed?.articleTitle ?? '',
    articleAlign: 'left',
  };
}

export function composerBeatHasContent(beat: ComposerBeat): boolean {
  return (
    Boolean(beat.text.trim()) ||
    beat.files.length > 0 ||
    Boolean(beat.drop) ||
    Boolean(beat.articleTitle.trim())
  );
}

/** One overlay flush. Each beat is its own post; past this the sheet and chain get heavy. */
export const COMPOSER_THREAD_MAX_BEATS = 10;

export function composerThreadAtMax(
  beats: readonly ComposerBeat[]
): boolean {
  return beats.length >= COMPOSER_THREAD_MAX_BEATS;
}

export function canAddComposerThreadBeat(beats: readonly ComposerBeat[]): boolean {
  if (composerThreadAtMax(beats)) return false;
  const last = beats[beats.length - 1];
  return Boolean(last && composerBeatHasContent(last));
}

export function threadPlusHint(beats: readonly ComposerBeat[]): string {
  if (canAddComposerThreadBeat(beats)) return 'Add to thread';
  if (composerThreadAtMax(beats)) return "That's the longest thread for now.";
  return 'Write this post first';
}

export function appendComposerThreadBeat(
  beats: readonly ComposerBeat[]
): ComposerBeat[] {
  if (!canAddComposerThreadBeat(beats)) return [...beats];
  return [...beats, emptyComposerBeat()];
}

/** Drop a trailing empty beat when focus leaves it. */
export function collapseTrailingEmptyComposerBeat<T extends ComposerBeat>(
  beats: readonly T[],
  nextFocus: number
): { beats: T[]; focus: number } {
  if (beats.length < 2) {
    return { beats: [...beats], focus: Math.max(0, Math.min(nextFocus, beats.length - 1)) };
  }
  const lastIndex = beats.length - 1;
  const last = beats[lastIndex]!;
  if (nextFocus < lastIndex && !composerBeatHasContent(last)) {
    return { beats: beats.slice(0, lastIndex), focus: nextFocus };
  }
  return {
    beats: [...beats],
    focus: Math.max(0, Math.min(nextFocus, beats.length - 1)),
  };
}

/** Remove an extra beat. Beat 1 (index 0) cannot be removed. */
export function removeComposerThreadBeat<T extends ComposerBeat>(
  beats: readonly T[],
  index: number,
  focus: number
): { beats: T[]; focus: number } {
  if (index <= 0 || beats.length < 2 || index >= beats.length) {
    return {
      beats: [...beats],
      focus: Math.max(0, Math.min(focus, beats.length - 1)),
    };
  }
  const next = beats.filter((_, rowIndex) => rowIndex !== index);
  const nextFocus =
    focus === index ? index - 1 : focus > index ? focus - 1 : focus;
  return {
    beats: next,
    focus: Math.max(0, Math.min(nextFocus, next.length - 1)),
  };
}

/**
 * After a partial flush, drop the filled beats that already landed.
 * Empty extras stay so the composer can continue.
 */
export function keepUnsentComposerBeats<T extends ComposerBeat>(
  beats: readonly T[],
  postedCount: number
): T[] {
  if (postedCount <= 0) return [...beats];
  const filledIndexes = beats.flatMap((beat, index) =>
    composerBeatHasContent(beat) ? [index] : []
  );
  const posted = new Set(filledIndexes.slice(0, postedCount));
  const remaining = beats.filter((_, index) => !posted.has(index));
  return remaining.length > 0 ? remaining : beats.slice(0, 1);
}

export function collapseComposerThreadToFirst(
  beats: readonly ComposerBeat[]
): ComposerBeat[] {
  return [beats[0] ?? emptyComposerBeat()];
}

export function composerSubmitHasContent(payload: ComposerSubmit): boolean {
  return (
    Boolean(payload.text.trim()) ||
    Boolean(payload.files?.length) ||
    Boolean(payload.drop) ||
    Boolean(payload.article?.title?.trim())
  );
}

export function splitComposerThread(payload: ComposerSubmit): ComposerSubmit[] {
  const extras = payload.thread ?? [];
  const root: ComposerSubmit = { ...payload };
  delete root.thread;
  return [root, ...extras].filter(composerSubmitHasContent);
}

export function beatToComposerSubmit(beat: ComposerBeat): ComposerSubmit {
  const labels = {
    ...(beat.contentWarning.trim()
      ? { contentWarning: beat.contentWarning.trim() }
      : {}),
    ...(beat.nsfw ? { nsfw: true } : {}),
  };
  const articleTitle = normalizeArticleTitle(beat.articleTitle);
  const article = articleTitle
    ? {
        article: {
          title: articleTitle,
          ...(beat.articleAlign !== 'left'
            ? { align: beat.articleAlign }
            : {}),
        },
      }
    : {};
  const poll =
    beat.pollEnabled
      ? {
          poll: {
            options: beat.pollOptions.map((option) => option.trim()).filter(Boolean),
            ...(beat.pollDurationMs != null
              ? { durationMs: beat.pollDurationMs }
              : {}),
          },
        }
      : {};
  const placeSlug = normalizePlaceSlug(beat.placeDraft);
  const place = placeSlug ? { places: [placeSlug] } : {};
  return {
    text: beat.text,
    ...(beat.files.length > 0 ? { files: beat.files } : {}),
    ...(beat.drop ? { drop: beat.drop } : {}),
    ...article,
    ...poll,
    ...place,
    ...labels,
  };
}

export function composerBeatsToSubmit(beats: readonly ComposerBeat[]): ComposerSubmit | null {
  const filled = beats.filter(composerBeatHasContent);
  if (filled.length === 0) return null;
  const [root, ...rest] = filled;
  const payload = beatToComposerSubmit(root!);
  if (rest.length > 0) {
    payload.thread = rest.map(beatToComposerSubmit);
  }
  return payload;
}

export function threadPartialCopy(posted: number, total: number): string {
  return `Posted ${posted} of ${total}.`;
}
