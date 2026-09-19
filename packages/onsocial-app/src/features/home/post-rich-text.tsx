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
import { splitProfileBioInlineDisplayRuns } from '@/lib/profile-bio-rich';
import { portfolioPath } from '@/lib/overlay-routes';

/** Post / quote / bio body with hashtag + ticker + @mention + url highlights. */
export function PostRichText({
  text,
  emptyFallback = '…',
  /** Bio / portfolio: Mage link icon. Posts: plain blue host label. */
  showLinkIcon = false,
  /** Bio only — posts and DMs stay hashtag / mention / url. */
  inlineMarks = false,
  /**
   * Activity / list quotes: paint tokens in DM Sans, keep the row as the
   * only hit. Feed / bio stay tappable.
   */
  interactive = true,
}: {
  text: string;
  emptyFallback?: string;
  showLinkIcon?: boolean;
  inlineMarks?: boolean;
  interactive?: boolean;
}) {
  const activeFocus = useHomeActiveFocus();

  if (!text) return <>{emptyFallback}</>;

  return (
    <>
      {splitPostRichText(text).map((segment, index) => {
        if (segment.type === 'text') {
          if (!inlineMarks) {
            return <span key={`t-${index}`}>{segment.value}</span>;
          }
          return (
            <span key={`t-${index}`}>
              {splitProfileBioInlineDisplayRuns(segment.value).map(
                (run, runIndex) => {
                  const inner = run.italic ? (
                    <em key={`i-${runIndex}`}>{run.value}</em>
                  ) : (
                    run.value
                  );
                  if (run.bold) {
                    return <strong key={`b-${runIndex}`}>{inner}</strong>;
                  }
                  if (run.italic) {
                    return inner;
                  }
                  return <span key={`p-${runIndex}`}>{run.value}</span>;
                }
              )}
            </span>
          );
        }

        if (segment.type === 'url') {
          return (
            <OsAutolinkChip
              key={`u-${index}`}
              href={segment.href}
              text={segment.value}
              as={interactive ? 'a' : 'span'}
              showIcon={showLinkIcon}
              onClick={
                interactive
                  ? (event) => {
                      event.stopPropagation();
                    }
                  : undefined
              }
            />
          );
        }

        if (segment.type === 'mention') {
          if (!interactive) {
            return (
              <span key={`m-${index}`} className="os-mention">
                {segment.value}
              </span>
            );
          }
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
          const tickerClass = isActive ? 'os-ticker is-active' : 'os-ticker';
          const tickerLabel = formatTickerDisplay(segment.slug);
          if (!interactive) {
            return (
              <span key={`tk-${index}`} className={tickerClass}>
                {tickerLabel}
              </span>
            );
          }
          return (
            <Link
              key={`tk-${index}`}
              href={homeTickerPath(segment.slug)}
              className={tickerClass}
              scroll={false}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {tickerLabel}
            </Link>
          );
        }

        const slug = normalizeHashtagQuery(segment.value);
        const isActive =
          activeFocus?.kind === 'hashtag' && slug === activeFocus.value;
        const hashtagClass = isActive ? 'os-hashtag is-active' : 'os-hashtag';
        if (!interactive) {
          return (
            <span key={`h-${index}`} className={hashtagClass}>
              {segment.value}
            </span>
          );
        }

        return (
          <Link
            key={`h-${index}`}
            href={homeHashtagPath(slug)}
            className={hashtagClass}
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
