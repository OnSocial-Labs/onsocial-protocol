'use client';

import { useEffect, useMemo, useState } from 'react';
import { Divider } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { accountIdsEqual } from '@/lib/account-match';
import {
  fetchDiscoverProfiles,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import {
  PROFILE_SEARCH_MIN_QUERY_LENGTH,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';

const SEARCH_DEBOUNCE_MS = 220;
const SEARCH_RESULT_LIMIT = 8;

export function profileAccountSearchActive(
  query: string,
  accountResolved: boolean
): boolean {
  if (accountResolved) return false;
  return (
    normalizeProfileSearchQuery(query).length >= PROFILE_SEARCH_MIN_QUERY_LENGTH
  );
}

/**
 * Discover profile rows while typing a NEAR account — same pick list as
 * scarce transfer and guild add-member.
 */
export function ProfileAccountSearchPicks({
  query,
  excludeAccountIds = [],
  includeAccountIds,
  enabled,
  disabled = false,
  onPick,
  viewerAccountId = null,
  emptyHint = 'No profiles found.',
  listAriaLabel = 'OnSocial profiles',
}: {
  query: string;
  excludeAccountIds?: readonly string[];
  /**
   * When set, only these accounts may appear (e.g. guild roster). Same
   * discover fetch + row chrome as unrestricted search.
   */
  includeAccountIds?: readonly string[];
  /** When false, hide the list (e.g. account already resolved). */
  enabled: boolean;
  disabled?: boolean;
  onPick: (accountId: string) => void;
  viewerAccountId?: string | null;
  emptyHint?: string;
  listAriaLabel?: string;
}) {
  const [profiles, setProfiles] = useState<DiscoverProfileSummary[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedQuery = normalizeProfileSearchQuery(query);
  const searchActive =
    enabled &&
    !disabled &&
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!searchActive) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPending(true);
      setError(null);
      void fetchDiscoverProfiles(
        normalizedQuery,
        viewerAccountId,
        0,
        controller.signal
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          setProfiles(response.profiles);
          setPending(false);
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setProfiles([]);
          setPending(false);
          setError(cause instanceof Error ? cause.message : 'Search failed.');
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, searchActive, viewerAccountId]);

  const visibleProfiles = useMemo(() => {
    if (!searchActive) return [];
    return profiles
      .filter((profile) => {
        if (
          excludeAccountIds.some((id) =>
            accountIdsEqual(profile.accountId, id)
          )
        ) {
          return false;
        }
        if (
          includeAccountIds &&
          !includeAccountIds.some((id) =>
            accountIdsEqual(profile.accountId, id)
          )
        ) {
          return false;
        }
        return true;
      })
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [excludeAccountIds, includeAccountIds, profiles, searchActive]);

  if (!searchActive) return null;

  return (
    <div className="collection-allowlist-section">
      {pending && visibleProfiles.length === 0 ? (
        <p className="guild-add-member-hint">Searching…</p>
      ) : null}
      {error ? (
        <p className="guild-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!pending && visibleProfiles.length === 0 && !error ? (
        <p className="guild-add-member-hint">{emptyHint}</p>
      ) : null}
      {visibleProfiles.length > 0 ? (
        <div
          className="standing-list guild-add-member-results"
          role="listbox"
          aria-label={listAriaLabel}
        >
          {visibleProfiles.map((profile, index) => (
            <div key={profile.accountId}>
              {index > 0 ? <Divider variant="item" /> : null}
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="guild-add-member-result os-disabled-ink"
                disabled={disabled}
                onClick={() => onPick(profile.accountId)}
              >
                <StandingIdentity
                  accountId={profile.accountId}
                  profileName={profile.name}
                  avatarUrl={profile.avatarUrl}
                />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
