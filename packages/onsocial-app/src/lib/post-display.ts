import type { PostRow } from '@onsocial/sdk';

/** Composer hard cap for post body text. */
export const POST_TEXT_MAX_LENGTH = 4000;

/** Feed / list preview before “Show more” (text-only). */
export const POST_FEED_PREVIEW_CHARS = 280;

/** Tighter feed preview when the card also shows media. */
export const POST_FEED_PREVIEW_CHARS_WITH_MEDIA = 140;

/** Quoted-post inset preview. */
export const POST_QUOTE_PREVIEW_CHARS = 120;

/** Soft warn in composer when remaining budget dips below this. */
export const POST_TEXT_WARN_REMAINING = 200;

export function parsePostText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      text?: unknown;
      body?: unknown;
      content?: unknown;
    };

    if (typeof parsed.text === 'string') return parsed.text.trim();
    if (typeof parsed.body === 'string') return parsed.body.trim();
    if (typeof parsed.content === 'string') return parsed.content.trim();
  } catch {
    // plain text fallback
  }

  return trimmed;
}

/** Poll embed stored on post JSON (`embeds[].kind === 'poll'`). */
export interface PostPollEmbed {
  kind: 'poll';
  question: string;
  options: string[];
  closesAt?: number;
}

export function parsePostPollEmbed(value: string): PostPollEmbed | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { embeds?: unknown };
    if (!Array.isArray(parsed.embeds)) return null;

    for (const entry of parsed.embeds) {
      if (!entry || typeof entry !== 'object') continue;
      const embed = entry as Record<string, unknown>;
      if (embed.kind !== 'poll') continue;
      if (typeof embed.question !== 'string' || !embed.question.trim()) {
        continue;
      }
      if (!Array.isArray(embed.options)) continue;
      const options = embed.options
        .filter((option): option is string => typeof option === 'string')
        .map((option) => option.trim())
        .filter(Boolean);
      if (options.length < 2) continue;

      const closesAt =
        typeof embed.closesAt === 'number' && Number.isFinite(embed.closesAt)
          ? embed.closesAt
          : undefined;

      return {
        kind: 'poll',
        question: embed.question.trim(),
        options,
        closesAt,
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Collection (Drop) embed stored on post JSON (`embeds[].kind === 'collection'`). */
export interface PostCollectionEmbed {
  kind: 'collection';
  chain: string;
  contract: string;
  collectionId: string;
  /** Holder edition when the post is about a specific seat / token. */
  tokenId?: string;
}

export function parsePostCollectionEmbed(
  value: string
): PostCollectionEmbed | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { embeds?: unknown };
    if (!Array.isArray(parsed.embeds)) return null;

    for (const entry of parsed.embeds) {
      if (!entry || typeof entry !== 'object') continue;
      const embed = entry as Record<string, unknown>;
      if (embed.kind !== 'collection') continue;
      if (typeof embed.chain !== 'string' || !embed.chain.trim()) continue;
      if (typeof embed.contract !== 'string' || !embed.contract.trim()) {
        continue;
      }
      if (
        typeof embed.collectionId !== 'string' ||
        !embed.collectionId.trim()
      ) {
        continue;
      }
      const tokenId =
        typeof embed.tokenId === 'string' && embed.tokenId.trim()
          ? embed.tokenId.trim()
          : undefined;
      return {
        kind: 'collection',
        chain: embed.chain.trim(),
        contract: embed.contract.trim(),
        collectionId: embed.collectionId.trim(),
        ...(tokenId ? { tokenId } : {}),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Token embed for post-minted / non-collection resale announces. */
export interface PostTokenEmbed {
  kind: 'token';
  chain: string;
  contract: string;
  tokenId: string;
}

export function parsePostTokenEmbed(value: string): PostTokenEmbed | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { embeds?: unknown };
    if (!Array.isArray(parsed.embeds)) return null;

    for (const entry of parsed.embeds) {
      if (!entry || typeof entry !== 'object') continue;
      const embed = entry as Record<string, unknown>;
      if (embed.kind !== 'token') continue;
      if (typeof embed.chain !== 'string' || !embed.chain.trim()) continue;
      if (typeof embed.contract !== 'string' || !embed.contract.trim()) {
        continue;
      }
      if (typeof embed.tokenId !== 'string' || !embed.tokenId.trim()) continue;
      return {
        kind: 'token',
        chain: embed.chain.trim(),
        contract: embed.contract.trim(),
        tokenId: embed.tokenId.trim(),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Optional first-paint snapshot under `x.onsocial.drop`. */
export interface DropPaintSnapshot {
  /** Present for Drop announces; omitted for token-only (`s:`) resales. */
  collectionId?: string;
  tokenId?: string;
  title?: string;
  mediaUrl?: string;
  mediumKind?: string;
  /** Original mint post path for See original. */
  sourcePostPath?: string;
}

export function parseDropPaintSnapshot(
  value: string
): DropPaintSnapshot | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as {
      x?: { onsocial?: { drop?: unknown } };
    };
    const drop = parsed.x?.onsocial?.drop;
    if (!drop || typeof drop !== 'object' || Array.isArray(drop)) return null;
    const record = drop as Record<string, unknown>;
    const collectionId =
      typeof record.collectionId === 'string' && record.collectionId.trim()
        ? record.collectionId.trim()
        : undefined;
    const tokenId =
      typeof record.tokenId === 'string' && record.tokenId.trim()
        ? record.tokenId.trim()
        : undefined;
    if (!collectionId && !tokenId) return null;
    const title =
      typeof record.title === 'string' && record.title.trim()
        ? record.title.trim()
        : undefined;
    const mediaUrl =
      typeof record.mediaUrl === 'string' && record.mediaUrl.trim()
        ? record.mediaUrl.trim()
        : typeof record.mediaCid === 'string' && record.mediaCid.trim()
          ? record.mediaCid.trim()
          : undefined;
    const mediumKind =
      typeof record.mediumKind === 'string' && record.mediumKind.trim()
        ? record.mediumKind.trim().toLowerCase()
        : undefined;
    const sourcePostPath =
      typeof record.sourcePostPath === 'string' && record.sourcePostPath.trim()
        ? record.sourcePostPath.trim()
        : undefined;
    return {
      ...(collectionId ? { collectionId } : {}),
      ...(tokenId ? { tokenId } : {}),
      ...(title ? { title } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(mediumKind ? { mediumKind } : {}),
      ...(sourcePostPath ? { sourcePostPath } : {}),
    };
  } catch {
    return null;
  }
}

/** Fixed locale so SSR and the browser never disagree on month/day order. */
const POST_TIMESTAMP_LOCALE = 'en-US';

export function formatPostTimestamp(blockTimestamp: number | string): string {
  const date = resolvePostDate(blockTimestamp);
  if (!date) return 'Unknown time';

  // Always include the year — clearer on thread roots than “Jul 15, 4:12 PM”.
  return new Intl.DateTimeFormat(POST_TIMESTAMP_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function resolvePostDate(blockTimestamp: number | string): Date | null {
  const timestamp =
    typeof blockTimestamp === 'string'
      ? Number(blockTimestamp)
      : blockTimestamp;

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const ms =
    timestamp > 100_000_000_000_000_000
      ? timestamp / 1_000_000
      : timestamp > 100_000_000_000_000
        ? timestamp / 1_000
        : timestamp > 100_000_000_000
          ? timestamp
          : timestamp * 1000;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function postTimestampIso(
  blockTimestamp: number | string
): string | undefined {
  return resolvePostDate(blockTimestamp)?.toISOString();
}

/**
 * Compact feed-style timestamp: `now`, `5m`, `2h`, `3d`, then a short date.
 * Pair with the absolute time (title/dateTime) for precision on demand.
 */
export function formatRelativePostTimestamp(
  blockTimestamp: number | string,
  now: Date = new Date()
): string {
  const date = resolvePostDate(blockTimestamp);
  if (!date) return 'Unknown time';

  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < 60_000) return 'now';

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Intl.DateTimeFormat(POST_TIMESTAMP_LOCALE, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

export function postKey(post: PostRow): string {
  return `${post.accountId}:${post.postId}`;
}

export function postFeedPreviewLimit(hasMedia: boolean): number {
  return hasMedia
    ? POST_FEED_PREVIEW_CHARS_WITH_MEDIA
    : POST_FEED_PREVIEW_CHARS;
}

/** Collapse whitespace runs for preview measurement (quotes / feed). */
export function normalizePostPreviewText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Truncate for preview surfaces. Returns original when it already fits;
 * otherwise ends with an ellipsis character.
 */
export function truncatePostPreview(text: string, maxChars: number): string {
  const normalized = normalizePostPreviewText(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

export function postPreviewNeedsExpand(
  text: string,
  maxChars: number
): boolean {
  return normalizePostPreviewText(text).length > maxChars;
}
