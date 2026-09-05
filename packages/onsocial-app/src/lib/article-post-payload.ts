import type { PostRow, ProfileAboutAlign } from '@onsocial/sdk';
import { parsePostText, truncatePostPreview } from '@/lib/post-display';
import { parsePostMedia, postStillImages } from '@/lib/post-media';

export type ArticleAlign = ProfileAboutAlign;

const ARTICLE_ALIGN_DEFAULT: ArticleAlign = 'left';

/** Composer + stored article title cap. */
export const ARTICLE_TITLE_MAX = 80;

/** Derived excerpt when the author did not store one. */
export const ARTICLE_EXCERPT_CHARS = 200;

export interface ArticleSnapshot {
  title: string;
  excerpt?: string;
  align: ArticleAlign;
  collectionId?: string;
}

export interface ArticleComposeInput {
  title: string;
  align?: ArticleAlign;
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
  return {
    onsocial: {
      article: {
        title,
        ...(align !== ARTICLE_ALIGN_DEFAULT ? { align } : {}),
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
  return {
    title,
    align: normalizeArticleAlign(article.align),
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
  return {
    title,
    align: normalizeArticleAlign(record.align),
    ...(excerpt ? { excerpt } : {}),
    ...(collectionId ? { collectionId } : {}),
  };
}

export function isArticlePost(post: Pick<PostRow, 'value'>): boolean {
  return parseArticleSnapshot(post.value) != null;
}

export function articleExcerpt(value: string): string {
  const article = parseArticleSnapshot(value);
  if (article?.excerpt) {
    return truncatePostPreview(article.excerpt, ARTICLE_EXCERPT_CHARS);
  }
  return truncatePostPreview(parsePostText(value), ARTICLE_EXCERPT_CHARS);
}

export function articleCoverUrl(value: string): string | null {
  const stills = postStillImages(parsePostMedia(value));
  return stills[0]?.url?.trim() || null;
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
