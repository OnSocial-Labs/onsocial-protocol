'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  isDiscoverCatalogQuery,
  visibleCatalogSectionIds,
  type DiscoverCatalogSectionId,
} from '@/features/discover/discover-catalog';
import {
  loadDiscoverCatalog,
  type DiscoverCatalogResults,
} from '@/features/discover/discover-catalog-search';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { APP_EVENTS_PATH, dropsPath, collectionPath } from '@/lib/app-routes';
import { portfolioPath, writingArticlePath } from '@/lib/overlay-routes';

const SECTION_LABEL: Record<DiscoverCatalogSectionId, string> = {
  people: 'People',
  articles: 'Articles',
  books: 'Books',
  music: 'Music',
  events: 'Events',
};

function faceInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

function CatalogFace({
  accountId,
  name,
  avatarUrl,
}: {
  accountId: string;
  name: string;
  avatarUrl?: string | null;
}) {
  return (
    <AccountAvatar
      accountId={accountId}
      src={avatarUrl}
      fallbackInitial={faceInitial(name)}
      size="lg"
    />
  );
}

function CatalogCover({ src }: { src: string | null }) {
  return (
    <span
      className={`market-listing-thumb drops-discovery-thumb${
        src ? ' has-media' : ''
      }`}
    >
      {src ? (
        <img src={src} alt="" />
      ) : (
        <span className="market-listing-thumb-fallback" />
      )}
    </span>
  );
}

function CatalogRow({
  href,
  title,
  meta,
  face,
  coverUrl,
}: {
  href: string;
  title: string;
  meta?: string;
  face?: { accountId: string; avatarUrl?: string | null };
  coverUrl?: string | null;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`market-listing-row discover-catalog-row${
        face ? ' discover-catalog-row--face' : ''
      }`}
      role="listitem"
    >
      {face ? (
        <CatalogFace
          accountId={face.accountId}
          name={title}
          avatarUrl={face.avatarUrl}
        />
      ) : (
        <CatalogCover src={coverUrl ?? null} />
      )}
      <div className="market-listing-copy">
        <span className="market-listing-title">{title}</span>
        {meta ? <p className="drops-discovery-deal">{meta}</p> : null}
      </div>
    </Link>
  );
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="os-surface-chip"
      aria-label={label}
    >
      More
    </Link>
  );
}

export function DiscoverCatalogResults({ query }: { query: string }) {
  const { setTab } = useDiscoverPanel();
  const [results, setResults] = useState<DiscoverCatalogResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isDiscoverCatalogQuery(trimmed)) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setResults(null);
      void loadDiscoverCatalog(trimmed)
        .then((next) => {
          if (!cancelled) setResults(next);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  const counts = {
    people: results?.people.length ?? 0,
    articles: results?.articles.length ?? 0,
    books: results?.books.length ?? 0,
    music: results?.music.length ?? 0,
    events: results?.events.length ?? 0,
  };
  const sections = visibleCatalogSectionIds(counts);
  const empty = !loading && results != null && sections.length === 0;

  return (
    <div role="region" aria-label="Search results" className="discover-catalog">
      {loading && results == null ? <MarketListSkeleton rows={4} /> : null}
      {results?.failed && sections.length === 0 ? (
        <p className="market-section-title">Couldn’t search.</p>
      ) : null}
      {results?.partial ? (
        <p className="market-section-title">Some results didn’t load.</p>
      ) : null}
      {empty && !results?.failed ? (
        <p className="market-section-title">Nothing matches.</p>
      ) : null}
      {results
        ? sections.map((id) => (
            <section
              key={id}
              className="market-section"
              aria-labelledby={`discover-catalog-${id}`}
            >
              <h2
                id={`discover-catalog-${id}`}
                className="market-section-title"
              >
                {SECTION_LABEL[id]}
              </h2>
              <div role="list">
                {id === 'people'
                  ? results.people.map((person) => (
                      <CatalogRow
                        key={person.accountId}
                        href={portfolioPath(person.accountId)}
                        title={person.name}
                        meta={
                          person.name === person.accountId
                            ? undefined
                            : person.accountId
                        }
                        face={{
                          accountId: person.accountId,
                          avatarUrl: person.avatarUrl,
                        }}
                      />
                    ))
                  : null}
                {id === 'articles'
                  ? results.articles.map((article) => (
                      <CatalogRow
                        key={`${article.accountId}/${article.postId}`}
                        href={writingArticlePath(
                          article.accountId,
                          article.postId
                        )}
                        title={article.title}
                        meta={article.accountId}
                        face={{ accountId: article.accountId }}
                      />
                    ))
                  : null}
                {id === 'books'
                  ? results.books.map((drop) => (
                      <CatalogRow
                        key={drop.collectionId}
                        href={collectionPath(drop.collectionId)}
                        title={drop.title}
                        meta={drop.meta}
                        coverUrl={drop.imageUrl}
                      />
                    ))
                  : null}
                {id === 'music'
                  ? results.music.map((drop) => (
                      <CatalogRow
                        key={drop.collectionId}
                        href={collectionPath(drop.collectionId)}
                        title={drop.title}
                        meta={drop.meta}
                        coverUrl={drop.imageUrl}
                      />
                    ))
                  : null}
                {id === 'events'
                  ? results.events.map((drop) => (
                      <CatalogRow
                        key={drop.collectionId}
                        href={collectionPath(drop.collectionId)}
                        title={drop.title}
                        meta={drop.meta}
                        coverUrl={drop.imageUrl}
                      />
                    ))
                  : null}
              </div>
              {id === 'people' && results.peopleHasMore ? (
                <button
                  type="button"
                  className="os-surface-chip"
                  aria-label="More people"
                  onClick={() => setTab('profiles')}
                >
                  More
                </button>
              ) : null}
              {id === 'books' && results.booksHasMore ? (
                <MoreLink
                  href={dropsPath({ kind: 'writing' })}
                  label="More books"
                />
              ) : null}
              {id === 'music' && results.musicHasMore ? (
                <MoreLink
                  href={dropsPath({ kind: 'audio' })}
                  label="More music"
                />
              ) : null}
              {id === 'events' && results.eventsHasMore ? (
                <MoreLink href={APP_EVENTS_PATH} label="More events" />
              ) : null}
            </section>
          ))
        : null}
    </div>
  );
}
