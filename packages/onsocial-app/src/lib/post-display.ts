import type { PostRow } from '@onsocial/sdk';

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

export function formatPostTimestamp(blockTimestamp: number | string): string {
  const date = resolvePostDate(blockTimestamp);
  if (!date) return 'Unknown time';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
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

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

export function postKey(post: PostRow): string {
  return `${post.accountId}:${post.postId}`;
}
