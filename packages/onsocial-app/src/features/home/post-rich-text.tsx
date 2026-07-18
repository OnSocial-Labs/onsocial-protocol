'use client';

import Link from 'next/link';
import { OsAutolinkChip } from '@/features/home/os-autolink-chip';
import { useHomeActiveFocus } from '@/features/home/home-active-hashtag';
import {
  homeHashtagPath,
  normalizeHashtagQuery,
} from '@/features/home/home-hashtag-search';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { splitPostRichText } from '@/features/home/post-rich-segments';
import { portfolioPath } from '@/lib/overlay-routes';

/** Post / quote / bio body with hashtag + ticker + @mention + url highlights. */
export function PostRichText({
  text,
  emptyFallback = '…',
  /** Bio / portfolio: Mage link icon. Posts: plain blue host label. */
  showLinkIcon = false,
}: {
  text: string;
  emptyFallback?: string;
  showLinkIcon?: boolean;
}) {
  const activeFocus = useHomeActiveFocus();

  if (!text) return <>{emptyFallback}</>;

  return (
    <>
      {splitPostRichText(text).map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }

        if (segment.type === 'url') {
          return (
            <OsAutolinkChip
              key={`u-${index}`}
              href={segment.href}
              text={segment.value}
              as="a"
              showIcon={showLinkIcon}
              onClick={(event) => {
                event.stopPropagation();
              }}
            />
          );
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

        if (segment.type === 'ticker') {
          const isActive =
            activeFocus?.kind === 'ticker' &&
            segment.slug === activeFocus.value;
          return (
            <Link
              key={`tk-${index}`}
              href={homeTickerPath(segment.slug)}
              className={isActive ? 'os-ticker is-active' : 'os-ticker'}
              scroll={false}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {formatTickerDisplay(segment.slug)}
            </Link>
          );
        }

        const slug = normalizeHashtagQuery(segment.value);
        const isActive =
          activeFocus?.kind === 'hashtag' && slug === activeFocus.value;

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
