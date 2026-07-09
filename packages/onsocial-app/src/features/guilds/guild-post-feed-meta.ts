import type { PostData, PostRow } from '@onsocial/sdk';
import { normalizeAudiences } from '@onsocial/sdk';

type GuildPostFeedMetaTarget = Pick<PostRow, 'channel' | 'kind' | 'audiences'>;

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Parse audiences from indexer rows or in-memory post rows. */
export function parseGuildPostAudiences(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return normalizeAudiences(raw) ?? [];
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.includes('|')) {
      return trimmed
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return normalizeAudiences(trimmed) ?? [];
  }

  return normalizeAudiences(raw) ?? [];
}

/**
 * Feed metadata copied onto guild replies/quotes so room-filtered feeds
 * include the full thread, not just the root post.
 */
export function inheritedGuildReplyFeedMeta(
  target: GuildPostFeedMetaTarget,
  options: {
    fallbackChannel?: string | null;
    fallbackKind?: string | null;
    fallbackAudiences?: string[];
  } = {}
): Partial<Pick<PostData, 'channel' | 'kind' | 'audiences'>> {
  const channel =
    asTrimmedString(target.channel) ||
    asTrimmedString(options.fallbackChannel) ||
    undefined;
  if (!channel) return {};

  const meta: Partial<Pick<PostData, 'channel' | 'kind' | 'audiences'>> = {
    channel,
  };

  const kind =
    asTrimmedString(target.kind) || asTrimmedString(options.fallbackKind);
  if (kind) meta.kind = kind;

  const audiences = parseGuildPostAudiences(target.audiences);
  if (audiences.length > 0) {
    meta.audiences = audiences;
  } else if (options.fallbackAudiences?.length) {
    meta.audiences = options.fallbackAudiences;
  }

  return meta;
}
