import type { PostRow, ProfileAboutAlign } from '@onsocial/sdk';
import {
  canonicalizeMoodKey,
  DEFAULT_CARD_FORMAT,
  DEFAULT_MOOD,
  isCardFormat,
  isMarkColor,
  isMarkShape,
  splitMoodKey,
  type CardFormat,
  type MarkColor,
  type MarkShape,
  type MoodKey,
} from '@onsocial/text-card';
import {
  parseDropPaintSnapshot,
  parsePostText,
  truncatePostPreview,
} from '@/lib/post-display';
import { parsePostMedia, postStillImages } from '@/lib/post-media';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

export type ArticleAlign = ProfileAboutAlign;

const ARTICLE_ALIGN_DEFAULT: ArticleAlign = 'left';

/** Composer + stored article title cap. */
export const ARTICLE_TITLE_MAX = 80;

/** Derived excerpt when the author did not store one. */
export const ARTICLE_EXCERPT_CHARS = 200;

/** Text-card face pinned at publish — mood plus listing-parity craft. */
export type ArticleCoverPin = {
  mood: MoodKey;
  format: CardFormat;
  markShape: MarkShape;
  markColor: MarkColor;
};

export interface ArticleSnapshot {
  title: string;
  excerpt?: string;
  align: ArticleAlign;
  collectionId?: string;
  /**
   * Text-card cover pinned at publish. A still photo on the post always
   * wins; this is the card face when there is none. Never drifts later.
   */
  cover?: ArticleCoverPin;
}

export interface ArticleComposeInput {
  title: string;
  align?: ArticleAlign;
  /** Full pin — preferred. */
  cover?: Partial<ArticleCoverPin> | ArticleCoverPin;
  /** @deprecated Prefer `cover.mood` — still accepted for older callers. */
  coverMood?: MoodKey | string;
}

export function defaultArticleCoverPin(): ArticleCoverPin {
  return {
    mood: DEFAULT_MOOD,
    format: DEFAULT_CARD_FORMAT,
    markShape: 'rule',
    markColor: 'auto',
  };
}

/** Canonical mood key from composer / payload input, else null. */
export function normalizeArticleCoverMood(raw: unknown): MoodKey | null {
  if (typeof raw !== 'string') return null;
  return canonicalizeMoodKey(raw.trim());
}

function normalizeArticleCoverFormat(raw: unknown): CardFormat | null {
  return isCardFormat(raw) ? raw : null;
}

function normalizeArticleCoverMarkShape(raw: unknown): MarkShape | null {
  return isMarkShape(raw) ? raw : null;
}

function normalizeArticleCoverMarkColor(raw: unknown): MarkColor | null {
  return isMarkColor(raw) ? raw : null;
}

/**
 * Resolve a full cover pin from composer input or a stored cover object.
 * Legacy mood-only covers keep mark defaults (rule + auto) and derive
 * format from the mood voice when format is absent.
 */
export function resolveArticleCoverPin(
  cover: Partial<ArticleCoverPin> | ArticleCoverPin | null | undefined,
  fallbackMood?: MoodKey | string | null
): ArticleCoverPin {
  const defaults = defaultArticleCoverPin();
  const mood =
    normalizeArticleCoverMood(cover?.mood) ??
    normalizeArticleCoverMood(fallbackMood) ??
    defaults.mood;
  const voice = splitMoodKey(mood)?.voice;
  const formatFromMood =
    voice && isCardFormat(voice) ? voice : defaults.format;
  return {
    mood,
    format: normalizeArticleCoverFormat(cover?.format) ?? formatFromMood,
    markShape:
      normalizeArticleCoverMarkShape(cover?.markShape) ?? defaults.markShape,
    markColor:
      normalizeArticleCoverMarkColor(cover?.markColor) ?? defaults.markColor,
  };
}

/** Title present → this post is an article. */
export function normalizeArticleTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = raw.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  return title.slice(0, ARTICLE_TITLE_MAX);
}

export function normalizeArticleAlign(raw: unknown): ArticleAlign {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'center' || value === 'justify') return value;
  return ARTICLE_ALIGN_DEFAULT;
}

/** `x.onsocial.article` for create / optimistic JSON. */
export function articleSnapshotExtra(article: ArticleComposeInput) {
  const title = normalizeArticleTitle(article.title);
  if (!title) {
    return undefined;
  }
  const align = normalizeArticleAlign(article.align);
  const pin = resolveArticleCoverPin(article.cover, article.coverMood);
  return {
    onsocial: {
      article: {
        title,
        ...(align !== ARTICLE_ALIGN_DEFAULT ? { align } : {}),
        cover: {
          mood: pin.mood,
          format: pin.format,
          markShape: pin.markShape,
          markColor: pin.markColor,
        },
      },
    },
  };
}

export function resolveComposerArticle(
  article: ArticleComposeInput | null | undefined,
  blocked = false
): ArticleComposeInput | null {
  if (blocked || !article) return null;
  const title = normalizeArticleTitle(article.title);
  if (!title) return null;
  const cover = resolveArticleCoverPin(article.cover, article.coverMood);
  return {
    title,
    align: normalizeArticleAlign(article.align),
    cover,
  };
}

function readArticleRecord(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      x?: { onsocial?: { article?: unknown } };
    };
    const article = parsed.x?.onsocial?.article;
    if (!article || typeof article !== 'object' || Array.isArray(article)) {
      return null;
    }
    return article as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseArticleSnapshot(value: string): ArticleSnapshot | null {
  const record = readArticleRecord(value);
  if (!record) return null;
  const title = normalizeArticleTitle(record.title);
  if (!title) return null;
  const excerpt =
    typeof record.excerpt === 'string' && record.excerpt.trim()
      ? record.excerpt.trim()
      : undefined;
  const collectionId =
    typeof record.collectionId === 'string' && record.collectionId.trim()
      ? record.collectionId.trim()
      : undefined;
  const rawCover =
    record.cover &&
    typeof record.cover === 'object' &&
    !Array.isArray(record.cover)
      ? (record.cover as Record<string, unknown>)
      : null;
  const coverMood = normalizeArticleCoverMood(rawCover?.mood);
  const cover = coverMood
    ? resolveArticleCoverPin(
        {
          mood: coverMood,
          format: normalizeArticleCoverFormat(rawCover?.format) ?? undefined,
          markShape:
            normalizeArticleCoverMarkShape(rawCover?.markShape) ?? undefined,
          markColor:
            normalizeArticleCoverMarkColor(rawCover?.markColor) ?? undefined,
        },
        coverMood
      )
    : undefined;
  return {
    title,
    align: normalizeArticleAlign(record.align),
    ...(excerpt ? { excerpt } : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(cover ? { cover } : {}),
  };
}

export function isArticlePost(post: Pick<PostRow, 'value'>): boolean {
  return parseArticleSnapshot(post.value) != null;
}

/**
 * Collapse body into a one-line tease. Keep `*italic*` / `**bold**` for
 * inline marks; drop heading and list chrome so `# After midnight` reads
 * as a sentence, not source.
 */
export function articleTeaseSource(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading?.[1]) return heading[1].trim();
      const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
      if (unordered?.[1]) return unordered[1].trim();
      const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (ordered?.[1]) return ordered[1].trim();
      return trimmed;
    })
    .filter(Boolean)
    .join(' ');
}

export function articleExcerpt(value: string): string {
  const article = parseArticleSnapshot(value);
  if (article?.excerpt) {
    return truncatePostPreview(
      articleTeaseSource(article.excerpt),
      ARTICLE_EXCERPT_CHARS
    );
  }
  return truncatePostPreview(
    articleTeaseSource(parsePostText(value)),
    ARTICLE_EXCERPT_CHARS
  );
}

/** Owner always sees Writing. Visitors only after at least one article. */
export function shouldShowWritingLink(opts: {
  isOwner: boolean;
  hasArticles: boolean | null;
}): boolean {
  if (opts.isOwner) return true;
  return opts.hasArticles === true;
}

export function articleCoverUrl(value: string): string | null {
  const stills = postStillImages(parsePostMedia(value));
  const still = stills[0]?.url?.trim() || null;
  if (still) return still;

  const dropMedia = parseDropPaintSnapshot(value)?.mediaUrl?.trim() || null;
  if (!dropMedia) return null;
  if (
    dropMedia.startsWith('http://') ||
    dropMedia.startsWith('https://') ||
    dropMedia.startsWith('data:')
  ) {
    return dropMedia;
  }
  return (
    resolveProfileMediaUrl(
      dropMedia.startsWith('ipfs://') ? dropMedia : `ipfs://${dropMedia}`
    ) ?? dropMedia
  );
}

export type ResolvedArticleCover = {
  /** Raster cover URL — post still, or legacy minted scarce media. */
  coverUrl: string | null;
  /** Text-card mood when the cover is a generated card (null → default). */
  cardBg: MoodKey | null;
  /** Pinned craft — present when the cover is a generated card. */
  format: CardFormat | null;
  markShape: MarkShape | null;
  markColor: MarkColor | null;
  /**
   * True when the cover is pinned — post media is immutable and the payload
   * mood was written at publish. False only for legacy articles resolved
   * through the scarce-embed fallback.
   */
  pinned: boolean;
};

/**
 * The one cover rule: post still → pinned payload craft → legacy minted
 * scarce hints → default card. Every surface (shelf, article, mint)
 * resolves through here so a piece keeps one face everywhere.
 */
export function resolveArticleCover(opts: {
  value: string;
  scarceMediaUrl?: string | null;
  scarceCardBg?: string | null;
}): ResolvedArticleCover {
  const still = articleCoverUrl(opts.value);
  if (still) {
    return {
      coverUrl: still,
      cardBg: null,
      format: null,
      markShape: null,
      markColor: null,
      pinned: true,
    };
  }
  const pinned = parseArticleSnapshot(opts.value)?.cover ?? null;
  if (pinned) {
    return {
      coverUrl: null,
      cardBg: pinned.mood,
      format: pinned.format,
      markShape: pinned.markShape,
      markColor: pinned.markColor,
      pinned: true,
    };
  }
  const scarceMedia = opts.scarceMediaUrl?.trim() || null;
  if (scarceMedia) {
    return {
      coverUrl: scarceMedia,
      cardBg: null,
      format: null,
      markShape: null,
      markColor: null,
      pinned: false,
    };
  }
  return {
    coverUrl: null,
    cardBg: normalizeArticleCoverMood(opts.scarceCardBg),
    format: null,
    markShape: null,
    markColor: null,
    pinned: false,
  };
}

/** Shelf / article meta — skip for very short pieces. */
export function formatWritingReadLabel(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 40) return null;
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min read`;
}

/** Card / byline likes — omit zeros. */
export function formatWritingLikeLabel(likeCount: number): string | null {
  const n = Math.max(0, Math.floor(Number(likeCount) || 0));
  if (n <= 0) return null;
  return n === 1 ? '1 like' : `${n} likes`;
}

function articleHashtags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as { hashtags?: unknown };
    if (!Array.isArray(parsed.hashtags)) return [];
    return parsed.hashtags.filter(
      (tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())
    );
  } catch {
    return [];
  }
}

/**
 * Feed / discover card hit. Titled articles open the piece; the thread
 * page (`detailLayout`) stays on the conversation.
 */
export function resolvePostCardOpenHref(opts: {
  articleHref: string | null;
  actionHref?: string | null;
  detailLayout?: boolean;
}): string | null {
  if (opts.articleHref && !opts.detailLayout) return opts.articleHref;
  return opts.actionHref ?? null;
}

/** Empty Writing shelf copy + whether the owner compose CTA can show. */
export function resolveWritingEmptyState(opts: {
  isOwner: boolean;
  articleCount: number;
  matchCount: number;
  canCompose: boolean;
}): 'owner-cta' | 'owner-copy' | 'visitor' | 'no-match' | null {
  if (opts.matchCount > 0) return null;
  if (opts.articleCount === 0) {
    if (!opts.isOwner) return 'visitor';
    return opts.canCompose ? 'owner-cta' : 'owner-copy';
  }
  return 'no-match';
}

/** Writing shelf always shows chrome search (Drops / Discover parity). */
export const WRITING_SEARCH_MIN_ARTICLES = 0;

export function shouldShowWritingSearch(_articleCount = 0): boolean {
  return true;
}

/** Chrome trailing count — “1 article” / “N articles”. */
export function formatWritingArticleCountLabel(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n === 1 ? '1 article' : `${n} articles`;
}

export function articleMatchesQuery(
  post: Pick<PostRow, 'value'>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const article = parseArticleSnapshot(post.value);
  if (!article) return false;
  const haystack = [
    article.title,
    article.excerpt ?? '',
    parsePostText(post.value),
    ...articleHashtags(post.value),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}
