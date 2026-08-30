'use client';

import Link from 'next/link';
import { ChevronRightIcon, MessageRoundIcon } from '@onsocial/ui';

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
  return (
    <Link href={href} className="thread-view-quotes" scroll={false}>
      <MessageRoundIcon className="thread-view-quotes-icon" aria-hidden />
      <span className="thread-view-quotes-label">View quotes</span>
      <span className="thread-view-quotes-count">{quoteCount}</span>
      <ChevronRightIcon className="thread-view-quotes-chevron" aria-hidden />
    </Link>
  );
}
