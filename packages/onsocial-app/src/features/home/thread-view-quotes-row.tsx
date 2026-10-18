'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@onsocial/ui';
import { RollingNumber } from '@/components/ui/rolling-number';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';

interface ThreadViewQuotesRowProps {
  href: string;
  label: string;
  count: number;
  /** Same confirm step as the post's share count. */
  rollSignal?: number;
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
}: ThreadViewQuotesRowProps) {
  const { openPostQuotes } = usePostThreadLayer();

  return (
    <Link
      href={href}
      className="thread-view-quotes"
      scroll={false}
      onClick={(event) => {
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!openPostQuotes({ href })) return;
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
