'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { AppShell } from '@/components/app/app-shell';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface DiscoverProfile {
  accountId: string;
  name?: string | null;
  bio?: string | null;
  standingCount?: number;
  endorsementsReceivedCount?: number;
}

function formatCount(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return String(value);
}

export function DiscoverPagePanel() {
  const { accountId, isLoading: walletLoading } = useAppWallet();
  const [query, setQuery] = useState('');
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) {
        params.set('q', query.trim());
      }
      if (accountId) {
        params.set('viewerAccountId', accountId);
      }

      const response = await fetch(`/api/discover?${params.toString()}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `Discover failed (${response.status})`);
      }

      const body = (await response.json()) as { profiles: DiscoverProfile[] };
      setProfiles(body.profiles ?? []);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not load profiles.';
      setError(message);
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [accountId, query]);

  useEffect(() => {
    if (walletLoading) {
      return;
    }

    const handle = window.setTimeout(() => {
      void search();
    }, 250);

    return () => window.clearTimeout(handle);
  }, [search, walletLoading]);

  return (
    <AppShell>
      <div className="discover-page">
        <header className="discover-page-header">
          <h1 className="discover-page-title">Discover</h1>
          <p className="discover-page-subtitle">
            Browse identities on the OnSocial graph.
          </p>
        </header>

        <div className="discover-search">
          <input
            className="discover-search-input"
            type="search"
            placeholder="Search by name or account"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {isLoading ? <div className="discover-state">Searching…</div> : null}
        {!isLoading && error ? (
          <div className="discover-state is-error">{error}</div>
        ) : null}

        {!isLoading && !error && profiles.length === 0 ? (
          <div className="discover-state">No profiles matched.</div>
        ) : null}

        {!isLoading && !error && profiles.length > 0 ? (
          <ul className="discover-list">
            {profiles.map((profile) => {
              const label = displayName(
                profile.accountId,
                profile.name ?? undefined
              );
              const handle = fallbackLabel(profile.accountId);
              const standing = profile.standingCount ?? 0;
              const endorsements = profile.endorsementsReceivedCount ?? 0;

              return (
                <li key={profile.accountId}>
                  <Link
                    className="discover-row"
                    href={portfolioPath(profile.accountId)}
                    scroll={false}
                  >
                    <span className="discover-row-name">{label}</span>
                    <span className="discover-row-handle">@{handle}</span>
                    {profile.bio ? (
                      <span className="discover-row-bio">{profile.bio}</span>
                    ) : null}
                    {standing > 0 || endorsements > 0 ? (
                      <span className="discover-row-meta">
                        {standing > 0 ? (
                          <span>{formatCount(standing)} standing</span>
                        ) : null}
                        {endorsements > 0 ? (
                          <span>{formatCount(endorsements)} endorsed</span>
                        ) : null}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}
