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
  const ms = blockTimestamp > 1_000_000_000_000 ? blockTimestamp : blockTimestamp * 1000;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function postKey(post: PostRow): string {
  return `${post.accountId}:${post.postId}`;
}
