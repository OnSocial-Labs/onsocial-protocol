'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@onsocial/ui';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';

interface ThreadViewQuotesRowProps {
  href: string;
  quoteCount: number;
}

/**
 * Quiet amplification row under the thread divider — quotes live on their own
 * screen (X/Bluesky pattern), so the detail page stays about the conversation.
 */
export function ThreadViewQuotesRow({
  href,
  quoteCount,
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
      <span className="thread-view-quotes-label">View quotes</span>
      <span className="thread-view-quotes-count">{quoteCount}</span>
      <ChevronRightIcon className="thread-view-quotes-chevron" aria-hidden />
    </Link>
  );
}
