'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  isNearNamedAccountComplete,
  normalizeNearAccountId,
} from '@/lib/portal-near-account';

export type MemberAccountLookupStatus =
  | 'idle'
  | 'checking'
  | 'exists'
  | 'not_found'
  | 'invalid'
  | 'error';

export interface MemberAccountLookupResult {
  accountId: string;
  status: MemberAccountLookupStatus;
  avatarUrl: string | null;
  displayName: string | null;
  message: string | null;
  exists: boolean;
  checking: boolean;
}

type LookupState =
  | { status: 'idle'; accountId: '' }
  | { status: 'checking'; accountId: string }
  | {
      status: 'exists';
      accountId: string;
      avatarUrl: string | null;
      displayName: string | null;
    }
  | { status: 'not_found'; accountId: string }
  | { status: 'invalid'; accountId: string }
  | { status: 'error'; accountId: string; message: string };

type CachedLookup = {
  avatarUrl: string | null;
  displayName: string | null;
  fetchedAt: number;
};

const FRESH_MS = 120_000;
const STALE_MS = 5 * 60_000;
const PROFILE_LOOKUP_TIMEOUT_MS = 8_000;

const memoryCache = new Map<string, CachedLookup>();
const inFlight = new Map<string, Promise<CachedLookup | null>>();

/** @deprecated Use isNearNamedAccountComplete from portal-near-account. */
export function isMemberAccountReady(accountId: string): boolean {
  return isNearNamedAccountComplete(accountId);
}

function isReadyToLookup(accountId: string): boolean {
  return isNearNamedAccountComplete(accountId);
}

const idleResult: MemberAccountLookupResult = {
  accountId: '',
  status: 'idle',
  avatarUrl: null,
  displayName: null,
  message: null,
  exists: false,
  checking: false,
};

function readCachedLookup(accountId: string): CachedLookup | null {
  const cached = memoryCache.get(accountId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt >= STALE_MS) {
    memoryCache.delete(accountId);
    return null;
  }
  return cached;
}

function writeCachedLookup(
  accountId: string,
  value: Omit<CachedLookup, 'fetchedAt'>
): CachedLookup {
  const entry: CachedLookup = { ...value, fetchedAt: Date.now() };
  memoryCache.set(accountId, entry);
  return entry;
}

function toExistsState(accountId: string, cached: CachedLookup): LookupState {
  return {
    status: 'exists',
    accountId,
    avatarUrl: cached.avatarUrl,
    displayName: cached.displayName,
  };
}

function getInitialLookupState(accountId: string): LookupState {
  if (!accountId || !isReadyToLookup(accountId)) {
    return { status: 'idle', accountId: '' };
  }

  const cached = readCachedLookup(accountId);
  if (cached) {
    return toExistsState(accountId, cached);
  }

  return { status: 'checking', accountId };
}

async function fetchProfileChip(
  accountId: string
): Promise<Pick<CachedLookup, 'avatarUrl' | 'displayName'>> {
  const profileResponse = await fetch(
    `/api/profile?accountId=${encodeURIComponent(accountId)}`,
    { signal: AbortSignal.timeout(PROFILE_LOOKUP_TIMEOUT_MS) }
  );
  const profileBody = (await profileResponse.json().catch(() => null)) as {
    avatarUrl?: string | null;
    profile?: { name?: string | null } | null;
  } | null;

  if (!profileResponse.ok || !profileBody) {
    return { avatarUrl: null, displayName: null };
  }

  return {
    avatarUrl: profileBody.avatarUrl ?? null,
    displayName: profileBody.profile?.name?.trim() ?? null,
  };
}

async function verifyNearAccountExists(accountId: string): Promise<boolean> {
  const nearResponse = await fetch(
    `/api/profile/near-facts?accountId=${encodeURIComponent(accountId)}`,
    { signal: AbortSignal.timeout(PROFILE_LOOKUP_TIMEOUT_MS) }
  );
  const nearBody = (await nearResponse.json().catch(() => null)) as {
    nearAccount?: { codeHash: string; storageUsage: number } | null;
    error?: string;
    detail?: string;
  } | null;

  if (!nearResponse.ok) {
    throw new Error(
      nearBody?.detail ?? nearBody?.error ?? 'Could not verify NEAR account'
    );
  }

  return !!nearBody?.nearAccount;
}

async function loadMemberAccountLookup(
  accountId: string,
  options: { trustedAccount: boolean }
): Promise<CachedLookup | null> {
  const existing = inFlight.get(accountId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      if (!options.trustedAccount) {
        const exists = await verifyNearAccountExists(accountId);
        if (!exists) {
          return null;
        }
      }

      const profile = await fetchProfileChip(accountId);
      return writeCachedLookup(accountId, profile);
    } catch (error) {
      if (options.trustedAccount) {
        return writeCachedLookup(accountId, {
          avatarUrl: null,
          displayName: null,
        });
      }

      throw error;
    } finally {
      inFlight.delete(accountId);
    }
  })();

  inFlight.set(accountId, promise);
  return promise;
}

export function prefetchMemberAccountLookups(
  accountIds: Iterable<string>,
  options?: { trustedAccount?: boolean }
): void {
  const trustedAccount = options?.trustedAccount ?? false;

  for (const rawAccountId of accountIds) {
    const accountId = normalizeNearAccountId(rawAccountId);
    if (!isReadyToLookup(accountId) || readCachedLookup(accountId)) {
      continue;
    }

    void loadMemberAccountLookup(accountId, { trustedAccount });
  }
}

export function useMemberAccountLookup(
  rawMemberId: string,
  options?: { debounceMs?: number; trustedAccount?: boolean }
): MemberAccountLookupResult {
  const accountId = normalizeNearAccountId(rawMemberId);
  const debounceMs = options?.debounceMs ?? 300;
  const trustedAccount = options?.trustedAccount ?? false;
  const [state, setState] = useState<LookupState>(() =>
    getInitialLookupState(accountId)
  );

  useEffect(() => {
    if (!accountId) {
      setState({ status: 'idle', accountId: '' });
      return;
    }

    if (!isReadyToLookup(accountId)) {
      setState({ status: 'idle', accountId: '' });
      return;
    }

    let cancelled = false;
    const cached = readCachedLookup(accountId);

    if (cached) {
      setState(toExistsState(accountId, cached));
      const age = Date.now() - cached.fetchedAt;
      if (age < FRESH_MS) {
        return;
      }
    } else {
      setState({ status: 'checking', accountId });
    }

    const timeoutId = window.setTimeout(
      () => {
        void (async () => {
          try {
            const result = await loadMemberAccountLookup(accountId, {
              trustedAccount,
            });

            if (cancelled) {
              return;
            }

            if (!result) {
              setState({ status: 'not_found', accountId });
              return;
            }

            setState(toExistsState(accountId, result));
          } catch (error) {
            if (cancelled) {
              return;
            }

            if (trustedAccount) {
              setState(
                toExistsState(
                  accountId,
                  writeCachedLookup(accountId, {
                    avatarUrl: null,
                    displayName: null,
                  })
                )
              );
              return;
            }

            setState({
              status: 'error',
              accountId,
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not verify NEAR account',
            });
          }
        })();
      },
      cached ? 0 : debounceMs
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accountId, debounceMs, trustedAccount]);

  return useMemo(() => {
    if (!accountId) {
      return idleResult;
    }

    if (!isReadyToLookup(accountId)) {
      return {
        accountId,
        status: 'idle',
        avatarUrl: null,
        displayName: null,
        message: null,
        exists: false,
        checking: false,
      };
    }

    if (state.accountId !== accountId) {
      const cached = readCachedLookup(accountId);
      if (cached) {
        return {
          accountId,
          status: 'exists',
          avatarUrl: cached.avatarUrl,
          displayName: cached.displayName,
          message: null,
          exists: true,
          checking: false,
        };
      }

      return {
        accountId,
        status: 'checking',
        avatarUrl: null,
        displayName: null,
        message: null,
        exists: false,
        checking: true,
      };
    }

    if (state.status === 'exists') {
      return {
        accountId,
        status: 'exists',
        avatarUrl: state.avatarUrl,
        displayName: state.displayName,
        message: null,
        exists: true,
        checking: false,
      };
    }

    if (state.status === 'not_found') {
      return {
        accountId,
        status: 'not_found',
        avatarUrl: null,
        displayName: null,
        message: 'Account not found on NEAR',
        exists: false,
        checking: false,
      };
    }

    if (state.status === 'error') {
      return {
        accountId,
        status: 'error',
        avatarUrl: null,
        displayName: null,
        message: state.message,
        exists: false,
        checking: false,
      };
    }

    if (state.status === 'checking') {
      return {
        accountId,
        status: 'checking',
        avatarUrl: null,
        displayName: null,
        message: null,
        exists: false,
        checking: true,
      };
    }

    return {
      accountId,
      status: 'idle',
      avatarUrl: null,
      displayName: null,
      message: null,
      exists: false,
      checking: false,
    };
  }, [accountId, state]);
}
