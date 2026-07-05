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

export function formatPostTimestamp(blockTimestamp: number): string {
  const date = resolvePostDate(blockTimestamp);
  if (!date) return 'Unknown time';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function resolvePostDate(blockTimestamp: number): Date | null {
  if (!Number.isFinite(blockTimestamp) || blockTimestamp <= 0) {
    return null;
  }

  const ms =
    blockTimestamp > 1_000_000_000_000 ? blockTimestamp : blockTimestamp * 1000;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function postTimestampIso(blockTimestamp: number): string | undefined {
  return resolvePostDate(blockTimestamp)?.toISOString();
}

export function postKey(post: PostRow): string {
  return `${post.accountId}:${post.postId}`;
}
