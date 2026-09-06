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
  articleTitle: string;
  articleAlign: ProfileAboutAlign;
};

export function emptyComposerBeat(
  seed?: Partial<Pick<ComposerBeat, 'text' | 'files' | 'drop'>>
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
    articleTitle: '',
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

export function canAddComposerThreadBeat(beats: readonly ComposerBeat[]): boolean {
  const last = beats[beats.length - 1];
  return Boolean(last && composerBeatHasContent(last));
}

export function appendComposerThreadBeat(
  beats: readonly ComposerBeat[]
): ComposerBeat[] {
  if (!canAddComposerThreadBeat(beats)) return [...beats];
  return [...beats, emptyComposerBeat()];
}

/** Drop a trailing empty beat when focus leaves it. */
export function collapseTrailingEmptyComposerBeat(
  beats: readonly ComposerBeat[],
  nextFocus: number
): { beats: ComposerBeat[]; focus: number } {
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
