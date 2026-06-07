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

export function useMemberAccountLookup(
  rawMemberId: string
): MemberAccountLookupResult {
  const accountId = normalizeNearAccountId(rawMemberId);
  const [state, setState] = useState<LookupState>({ status: 'idle', accountId: '' });

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
    const timeoutId = window.setTimeout(() => {
      setState({ status: 'checking', accountId });

      void (async () => {
        try {
          const nearResponse = await fetch(
            `/api/profile/near-facts?accountId=${encodeURIComponent(accountId)}`,
            { cache: 'no-store' }
          );
          const nearBody = (await nearResponse.json().catch(() => null)) as {
            nearAccount?: { codeHash: string; storageUsage: number } | null;
            error?: string;
            detail?: string;
          } | null;

          if (cancelled) {
            return;
          }

          if (!nearResponse.ok) {
            setState({
              status: 'error',
              accountId,
              message:
                nearBody?.detail ??
                nearBody?.error ??
                'Could not verify NEAR account',
            });
            return;
          }

          if (!nearBody?.nearAccount) {
            setState({ status: 'not_found', accountId });
            return;
          }

          let avatarUrl: string | null = null;
          let displayName: string | null = null;

          try {
            const profileResponse = await fetch(
              `/api/profile?accountId=${encodeURIComponent(accountId)}`,
              { cache: 'no-store' }
            );
            const profileBody = (await profileResponse.json().catch(
              () => null
            )) as {
              avatarUrl?: string | null;
              profile?: { name?: string | null } | null;
            } | null;

            if (profileResponse.ok && profileBody) {
              avatarUrl = profileBody.avatarUrl ?? null;
              displayName = profileBody.profile?.name?.trim() ?? null;
            }
          } catch {
            // OnSocial profile is optional once the NEAR account exists.
          }

          if (cancelled) {
            return;
          }

          setState({
            status: 'exists',
            accountId,
            avatarUrl,
            displayName,
          });
        } catch (error) {
          if (cancelled) {
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
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accountId]);

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
