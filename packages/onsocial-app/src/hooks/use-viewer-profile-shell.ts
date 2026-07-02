'use client';

import { useCallback, useEffect, useState } from 'react';
import { accountIdsEqual, canonicalAccountId } from '@/lib/account-match';
import { usePortfolioProfileSeed } from '@/contexts/portfolio-profile-seed-context';

interface ViewerProfileShell {
  displayName?: string;
  avatarUrl: string | null;
}

type FetchedShellState = {
  accountId: string;
  shell: ViewerProfileShell;
};

export function useViewerProfileShell(accountId: string | null | undefined) {
  const profileSeed = usePortfolioProfileSeed(accountId ?? '');
  const [fetchedState, setFetchedState] = useState<FetchedShellState | null>(
    null
  );

  useEffect(() => {
    if (!accountId) {
      return;
    }

    const normalizedId = canonicalAccountId(accountId);
    let cancelled = false;
    const controller = new AbortController();

    void fetch(
      `/api/profile/shell?accountId=${encodeURIComponent(normalizedId)}`,
      {
        signal: controller.signal,
      }
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ViewerProfileShell | null) => {
        if (!cancelled && body) {
          setFetchedState({
            accountId: normalizedId,
            shell: {
              displayName: body.displayName,
              avatarUrl: body.avatarUrl ?? null,
            },
          });
        }
      })
      .catch(() => {
        // ignore — fall back to initial
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accountId]);

  const patchShell = useCallback((patch: Partial<ViewerProfileShell>) => {
    setFetchedState((current) => {
      const shell = current?.shell;
      return {
        accountId: current?.accountId ?? '',
        shell: {
          displayName: patch.displayName ?? shell?.displayName,
          avatarUrl:
            patch.avatarUrl !== undefined
              ? patch.avatarUrl
              : (shell?.avatarUrl ?? null),
        },
      };
    });
  }, []);

  const normalizedAccountId = accountId ? canonicalAccountId(accountId) : null;
  const fetched =
    normalizedAccountId && fetchedState?.accountId === normalizedAccountId
      ? fetchedState.shell
      : null;

  const seededAvatar =
    profileSeed && accountId && accountIdsEqual(profileSeed.accountId, accountId)
      ? profileSeed.avatarUrl
      : null;
  const seededName =
    profileSeed && accountId && accountIdsEqual(profileSeed.accountId, accountId)
      ? profileSeed.displayName
      : undefined;

  return {
    displayName: seededName ?? fetched?.displayName,
    avatarUrl: seededAvatar ?? fetched?.avatarUrl ?? null,
    patchShell,
  };
}
