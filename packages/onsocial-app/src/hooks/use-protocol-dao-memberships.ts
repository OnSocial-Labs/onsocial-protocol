'use client';

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { fetchDaoRolesClient } from '@/lib/fetch-dao-roles-client';
import {
  EMPTY_PROTOCOL_DAO_MEMBERSHIPS,
  type ProtocolDaoMemberships,
} from '@/lib/protocol-dao-memberships';

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

const FeedDaoMembershipsContext = createContext<Record<
  string,
  ProtocolDaoMemberships
> | null>(null);

/** Page-level dao-role batch. Keys are lowercase account ids. */
export function FeedDaoMembershipsProvider({
  memberships,
  children,
}: PropsWithChildren<{
  memberships: Record<string, ProtocolDaoMemberships> | null;
}>) {
  return createElement(
    FeedDaoMembershipsContext.Provider,
    { value: memberships },
    children
  );
}

/**
 * Soft-fill protocol Governance / Treasury membership for person faces & lists.
 * A page seed is the first paint. Otherwise the per-account fetch still runs.
 */
export function useProtocolDaoMemberships(
  accountId: string,
  enabled: boolean
): ProtocolDaoMemberships | null {
  const normalized = accountId.trim().toLowerCase();
  const pageSeed = useContext(FeedDaoMembershipsContext);
  const seeded =
    pageSeed && Object.prototype.hasOwnProperty.call(pageSeed, normalized)
      ? pageSeed[normalized]
      : undefined;
  const [memberships, setMemberships] = useState<ProtocolDaoMemberships | null>(
    seeded ?? null
  );
  const [resolvedKey, setResolvedKey] = useState<string | null>(
    seeded !== undefined ? normalized : null
  );

  useEffect(() => {
    if (seeded !== undefined) return;
    if (!enabled || !normalized) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const data = await fetchDaoRolesClient(accountId, controller.signal);
        if (cancelled) return;
        setMemberships(data.memberships);
        setResolvedKey(normalized);
      } catch (error) {
        // Abort = unmount / account change — keep unresolved so we retry.
        if (cancelled || isAbortError(error)) return;
        setMemberships(EMPTY_PROTOCOL_DAO_MEMBERSHIPS);
        setResolvedKey(normalized);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accountId, enabled, normalized, seeded]);

  if (seeded !== undefined) return seeded;
  if (!enabled || !normalized || resolvedKey !== normalized) {
    return null;
  }
  return memberships;
}
