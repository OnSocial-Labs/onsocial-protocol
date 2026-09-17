'use client';

import Link from 'next/link';
import { NoteTextFillIcon, osChromeSubjectClassName } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsChromeSubject } from '@/components/profile/os-chrome-subject';
import { formatWritingArticleCountLabel } from '@/lib/article-post-payload';
import { portfolioPath } from '@/lib/overlay-routes';

export function WritingSearchHeading({
  query = '',
  onQueryChange,
  interactive = true,
}: {
  query?: string;
  onQueryChange?: (value: string) => void;
  interactive?: boolean;
}) {
  return (
    <OsAppChromeNavSearch
      value={query}
      onValueChange={
        interactive && onQueryChange ? onQueryChange : () => undefined
      }
      placeholder="Search writing"
      clearAriaLabel="Clear search"
      ariaLabel="Search writing"
      idleClassName="discover-nav-search-field"
      leadingIcon={<NoteTextFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

/** Slim sticky identity — count trails opposite; stays after search tucks. */
export function WritingIdentityToolbar({
  accountId,
  titleLabel,
  avatarUrl = null,
  articleCount = 0,
}: {
  accountId: string;
  titleLabel: string;
  avatarUrl?: string | null;
  articleCount?: number;
}) {
  const countLabel = formatWritingArticleCountLabel(articleCount);

  return (
    <div className="portfolio-writing-chrome-identity">
      <Link
        href={portfolioPath(accountId)}
        className={`${osChromeSubjectClassName} portfolio-writing-chrome-subject`}
        scroll={false}
        title={`${titleLabel} (@${accountId})`}
      >
        <OsChromeSubject
          accountId={accountId}
          profileName={titleLabel}
          avatarUrl={avatarUrl}
          primaryLabel={titleLabel}
          showHandle={false}
          avatarSize="sm"
          unstyled
        />
      </Link>
      <p className="portfolio-writing-chrome-kicker">{countLabel}</p>
    </div>
  );
}
