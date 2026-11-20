'use client';

import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { ChevronRightIcon } from '@onsocial/ui';
import { RollingNumber } from '@/components/ui/rolling-number';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import { warmQuotesOpen } from '@/lib/thread-first-page';

interface ThreadViewQuotesRowProps {
  href: string;
  label: string;
  count: number;
  /** Same confirm step as the post's share count. */
  rollSignal?: number;
  /** Seed the quotes shell when session caches miss. */
  root?: PostRow | null;
  rootEngagement?: PostEngagement | null;
}

/**
 * Quiet amplification row under the thread divider — quotes and reposts live
 * on their own view, so the thread stays about the conversation.
 */
export function ThreadViewQuotesRow({
  href,
  label,
  count,
  rollSignal = 0,
  root = null,
  rootEngagement = null,
}: ThreadViewQuotesRowProps) {
  const { openPostQuotes } = usePostThreadLayer();
  const idle = count <= 0;

  return (
    <Link
      href={href}
      className={`thread-view-quotes${idle ? ' is-idle' : ''}`}
      aria-hidden={idle ? true : undefined}
      tabIndex={idle ? -1 : undefined}
      scroll={false}
      onPointerDown={() => {
        if (idle) return;
        warmQuotesOpen();
      }}
      onClick={(event) => {
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!openPostQuotes({ href, root, rootEngagement })) return;
        event.preventDefault();
      }}
    >
      <span className="thread-view-quotes-label">{label}</span>
      <span className="sr-only">{count}</span>
      <span className="thread-view-quotes-count" aria-hidden="true">
        <RollingNumber value={count} rollSignal={rollSignal} />
      </span>
      <ChevronRightIcon className="thread-view-quotes-chevron" aria-hidden />
    </Link>
  );
}
