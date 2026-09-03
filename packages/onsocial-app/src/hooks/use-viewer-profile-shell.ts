'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseProfileKind, type ProfileKind } from '@onsocial/sdk';
import { accountIdsEqual, canonicalAccountId } from '@/lib/account-match';
import { usePortfolioProfileSeed } from '@/contexts/portfolio-profile-seed-context';

interface ViewerProfileShell {
  displayName?: string;
  avatarUrl: string | null;
  kind?: ProfileKind | null;
}

type FetchedShellState = {
  accountId: string;
  shell: ViewerProfileShell;
};

const VIEWER_SHELL_CACHE_KEY = 'onsocial:viewer-shell';

function readViewerShellCache(accountId: string): ViewerProfileShell | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(VIEWER_SHELL_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      accountId?: string;
      displayName?: string;
      avatarUrl?: string | null;
      kind?: string | null;
    };

    if (
      !parsed.accountId ||
      canonicalAccountId(parsed.accountId) !== canonicalAccountId(accountId)
    ) {
      return null;
    }

    return {
      displayName: parsed.displayName,
      avatarUrl: parsed.avatarUrl ?? null,
      kind: parseProfileKind(parsed.kind) ?? null,
    };
  } catch {
    return null;
  }
}

function writeViewerShellCache(
  accountId: string,
  shell: ViewerProfileShell
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(
      VIEWER_SHELL_CACHE_KEY,
      JSON.stringify({
        accountId: canonicalAccountId(accountId),
        displayName: shell.displayName,
        avatarUrl: shell.avatarUrl,
        kind: shell.kind ?? null,
      })
    );
  } catch {
    // ignore quota / privacy mode
  }
}

export function useViewerProfileShell(accountId: string | null | undefined) {
  const profileSeed = usePortfolioProfileSeed(accountId ?? '');
  const normalizedAccountId = accountId ? canonicalAccountId(accountId) : null;
  const cachedShell = normalizedAccountId
    ? readViewerShellCache(normalizedAccountId)
    : null;
  const [fetchedState, setFetchedState] = useState<FetchedShellState | null>(
    null
  );
  const [fetchSettledFor, setFetchSettledFor] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    if (!normalizedAccountId) {
      return;
    }

    const generation = ++fetchGenerationRef.current;
    const controller = new AbortController();
    const requestAccountId = normalizedAccountId;

    void fetch(
      `/api/profile/shell?accountId=${encodeURIComponent(normalizedAccountId)}`,
      {
        signal: controller.signal,
      }
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ViewerProfileShell | null) => {
        if (fetchGenerationRef.current !== generation) {
          return;
        }

        if (body) {
          const shell = {
            displayName: body.displayName,
            avatarUrl: body.avatarUrl ?? null,
            kind: parseProfileKind(body.kind) ?? null,
          };

          setFetchedState({
            accountId: requestAccountId,
            shell,
          });
          writeViewerShellCache(requestAccountId, shell);
        }
      })
      .catch(() => {
        // ignore abort / network — fall back to cache or initials
      })
      .finally(() => {
        if (fetchGenerationRef.current === generation) {
          setFetchSettledFor(requestAccountId);
        }
      });

    return () => {
      controller.abort();
    };
  }, [normalizedAccountId]);

  const patchShell = useCallback(
    (patch: Partial<ViewerProfileShell>) => {
      setFetchedState((current) => {
        const shell = current?.shell;
        const nextShell = {
          displayName: patch.displayName ?? shell?.displayName,
          avatarUrl:
            patch.avatarUrl !== undefined
              ? patch.avatarUrl
              : (shell?.avatarUrl ?? null),
          kind:
            patch.kind !== undefined ? patch.kind : (shell?.kind ?? null),
        };

        const nextAccountId = normalizedAccountId ?? current?.accountId ?? '';
        if (nextAccountId) {
          writeViewerShellCache(nextAccountId, nextShell);
        }

        return {
          accountId: nextAccountId,
          shell: nextShell,
        };
      });

      if (normalizedAccountId) {
        setFetchSettledFor(normalizedAccountId);
      }
    },
    [normalizedAccountId]
  );

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

  const resolvedShell =
    seededAvatar != null || seededName
      ? {
          displayName: seededName ?? fetched?.displayName ?? cachedShell?.displayName,
          avatarUrl: seededAvatar ?? fetched?.avatarUrl ?? cachedShell?.avatarUrl ?? null,
          kind: fetched?.kind ?? cachedShell?.kind ?? null,
        }
      : {
          displayName: fetched?.displayName ?? cachedShell?.displayName,
          avatarUrl: fetched?.avatarUrl ?? cachedShell?.avatarUrl ?? null,
          kind: fetched?.kind ?? cachedShell?.kind ?? null,
        };

  const fetchSettled = fetchSettledFor === normalizedAccountId;
  const isLoading =
    Boolean(normalizedAccountId) &&
    !resolvedShell.avatarUrl &&
    !fetchSettled &&
    seededAvatar == null;

  return {
    displayName: resolvedShell.displayName,
    avatarUrl: resolvedShell.avatarUrl,
    kind: resolvedShell.kind ?? null,
    isLoading,
    patchShell,
  };
}
