'use client';

import Link from 'next/link';
import { useHomeActiveHashtag } from '@/features/home/home-active-hashtag';
import {
  homeHashtagPath,
  normalizeHashtagQuery,
} from '@/features/home/home-hashtag-search';
import { splitPostRichText } from '@/features/home/post-rich-segments';
import { portfolioPath } from '@/lib/overlay-routes';

/** Post / quote body with hashtag + @mention highlights. */
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
      {splitPostRichText(text).map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }

        if (segment.type === 'mention') {
          return (
            <Link
              key={`m-${index}`}
              href={portfolioPath(segment.accountId)}
              className="os-mention"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {segment.value}
            </Link>
          );
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
