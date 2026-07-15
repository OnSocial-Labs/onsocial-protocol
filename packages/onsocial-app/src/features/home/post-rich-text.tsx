'use client';

import Link from 'next/link';
import { useHomeActiveHashtag } from '@/features/home/home-active-hashtag';
import {
  homeHashtagPath,
  normalizeHashtagQuery,
  splitTextWithHashtags,
} from '@/features/home/home-hashtag-search';

/** Post / quote body with protocol-green hashtag highlights. */
export function PostRichText({
  text,
  emptyFallback = '…',
}: {
  text: string;
  emptyFallback?: string;
}) {
  const activeTag = useHomeActiveHashtag();

  if (!text) return <>{emptyFallback}</>;

  return (
    <>
      {splitTextWithHashtags(text).map((segment, index) => {
        if (segment.type !== 'hashtag') {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }

        const slug = normalizeHashtagQuery(segment.value);
        const isActive = activeTag != null && slug === activeTag;

        return (
          <Link
            key={`h-${index}`}
            href={homeHashtagPath(slug)}
            className={isActive ? 'os-hashtag is-active' : 'os-hashtag'}
            scroll={false}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {segment.value}
          </Link>
        );
      })}
    </>
  );
}
