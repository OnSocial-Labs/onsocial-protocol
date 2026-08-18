'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ListLoadError } from '@/components/panels/list-load-error';
import { DiscoverCommunityHandoff } from '@/features/discover/discover-community-handoff';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import {
  creatorAccessShort,
  fetchAppsDirectory,
  type AppView,
} from '@/features/scarces/apps-data';
import { APPS_PAGE_SIZE } from '@/features/scarces/apps-directory';
import { hubCategoryLabel } from '@/features/scarces/hub-categories';
import {
  APP_APP_CREATE_PATH,
  APP_APPS_PATH,
  appPath,
} from '@/lib/app-routes';
import { fallbackLabel } from '@/lib/profile-display';

function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function storeMeta(app: AppView): string {
  const parts = [`@${fallbackLabel(app.ownerId)}`];
  const topicsLabel =
    app.categories.length > 0
      ? app.categories
          .map((category) => hubCategoryLabel(category) ?? category)
          .join(' · ')
      : hubCategoryLabel(app.category);
  if (topicsLabel) parts.push(topicsLabel);
  parts.push(creatorAccessShort(app.creatorAccess));
  return parts.join(' · ');
}

/**
 * Discover → Hubs — network find. My hubs / create live in the Hubs app.
 */
export function DiscoverHubsPanel() {
  const { query, clearSearch } = useDiscoverPanel();
  const searchQuery = discoverPeopleSearchQuery(query);
  const [apps, setApps] = useState<AppView[] | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });

    const timer = window.setTimeout(() => {
      void fetchAppsDirectory({
        limit: APPS_PAGE_SIZE,
        query: searchQuery || undefined,
        hideTest: true,
        sort: 'recent',
      })
        .then((page) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setApps(page.apps);
          setPending(false);
          setError(null);
        })
        .catch((cause) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setPending(false);
          setApps([]);
          setError(
            cause instanceof Error ? cause.message : 'Could not load hubs.'
          );
        });
    }, searchQuery ? 220 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reloadNonce, searchQuery]);

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const showSkeleton = apps == null && pending;
  const isSearchEmpty =
    Boolean(searchQuery) && !pending && apps != null && apps.length === 0;

  return (
    <div
      id="discover-panel-hubs"
      role="tabpanel"
      aria-labelledby="discover-tab-hubs"
      className="standing-panel-body discover-hubs-panel"
    >
      <div className="discover-community-toolbar">
        <p className="daos-index-empty dao-discover-status">
          {searchQuery
            ? `Searching “${searchQuery}”`
            : 'Creator hubs on this network'}
        </p>
        <DiscoverCommunityHandoff
          links={[
            { href: APP_APPS_PATH, label: 'My Hubs' },
            { href: APP_APP_CREATE_PATH, label: 'Create' },
          ]}
        />
      </div>

      {error ? <ListLoadError message={error} onRetry={retry} /> : null}

      {showSkeleton ? (
        <p className="daos-index-empty">Loading hubs…</p>
      ) : null}

      {!showSkeleton && apps != null && apps.length === 0 ? (
        <div className="standing-panel-empty-block">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">
              {isSearchEmpty
                ? 'No hubs match that search.'
                : 'No hubs listed yet.'}
            </p>
            <p className="standing-panel-empty-secondary">
              {isSearchEmpty
                ? 'Try another name or hub id.'
                : 'Open a hub in the Hubs app.'}
            </p>
          </div>
          <div className="standing-panel-empty-actions">
            {isSearchEmpty ? (
              <button
                type="button"
                className="standing-panel-empty-action"
                onClick={clearSearch}
              >
                Clear search
              </button>
            ) : (
              <Link
                className="standing-panel-empty-action"
                href={APP_APP_CREATE_PATH}
                scroll={false}
              >
                Open a hub
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {!showSkeleton && apps != null && apps.length > 0 ? (
        <ul className="market-listing-list apps-directory-list">
          {apps.map((app) => (
            <li key={app.appId}>
              <Link
                href={appPath(app.appId)}
                scroll={false}
                className="market-listing-row apps-directory-row"
              >
                <span
                  className={`market-listing-thumb apps-directory-logo${
                    app.mediaUrl ? ' has-media' : ''
                  }`}
                  aria-hidden
                >
                  {app.mediaUrl ? (
                    <img src={app.mediaUrl} alt="" />
                  ) : (
                    <span className="apps-directory-logo-fallback">
                      {monogram(app.title)}
                    </span>
                  )}
                </span>
                <span className="market-listing-copy">
                  <span className="market-listing-head">
                    <span className="market-listing-title">{app.title}</span>
                    <span className="market-listing-price">
                      {app.commissionPct}%
                    </span>
                  </span>
                  <span className="market-listing-meta">{storeMeta(app)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
