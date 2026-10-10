'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@onsocial/ui';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';

interface ThreadViewQuotesRowProps {
  href: string;
  label: string;
  count: number;
}

/**
 * Quiet amplification row under the thread divider — quotes and reposts live
 * on their own screen, so the detail page stays about the conversation.
 */
export function ThreadViewQuotesRow({
  href,
  label,
  count,
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
      <span className="thread-view-quotes-count">{count}</span>
      <ChevronRightIcon className="thread-view-quotes-chevron" aria-hidden />
    </Link>
  );
}
