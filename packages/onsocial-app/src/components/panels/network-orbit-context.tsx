'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  markNetworkOrbitReady,
  unmarkNetworkOrbitReady,
} from '@/lib/e2e-portfolio-ready';
import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import { displayName as resolveDisplayName } from '@/lib/profile-display';
import {
  networkFilterCounts,
  networkFilterToStandKind,
  networkUniqueConnectionTotal,
  type NetworkAccount,
  type NetworkCenterMood,
  type NetworkFilterKind,
  type NetworkOrbitSearchMeta,
  type NetworkStandingCounts,
} from '@/lib/profile-network';
import { fetchNetworkOrbit } from '@/lib/profile-network-client';
import {
  ORBIT_MIN_STAGE_SIZE,
  ORBIT_STAGE_SIZE,
  placeNetworkNodes,
  type OrbitPlacedNode,
} from '@/lib/profile-network-layout';
import { standingPath } from '@/lib/profile-social-standings';

export interface NetworkOrbitProviderProps {
  accountId: string;
  displayName?: string;
  avatarUrl?: string | null;
  /** Null when the server load failed — the client fetches on mount. */
  initialAccounts?: NetworkAccount[] | null;
  initialCounts?: NetworkStandingCounts | null;
  initialCenterMood?: NetworkCenterMood | null;
  initialViewerKnownCount?: number;
  initialSubjectEndorsedCount?: number;
  initialFilter?: NetworkFilterKind;
  initialQuery?: string;
  children: ReactNode;
}

interface NetworkOrbitContextValue {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  viewerAccountId: string | null;
  isSelf: boolean;
  centerMood: NetworkCenterMood | null;
  filter: NetworkFilterKind;
  setFilter: (filter: NetworkFilterKind) => void;
  query: string;
  setQuery: (query: string) => void;
  counts: ReturnType<typeof networkFilterCounts>;
  totalUnique: number;
  placedNodes: OrbitPlacedNode[];
  stageSize: number;
  /** Stage's horizontal offset inside the clipping wrap (stage is centered). */
  stageInsetX: number;
  stageWrapRef: RefObject<HTMLDivElement | null>;
  isDimmed: (account: NetworkAccount) => boolean;
  searchActive: boolean;
  searchFetching: boolean;
  searchMatchTotal: number;
  loading: boolean;
  loadError: string | null;
  mapShownCount: number;
  /** Shown accounts the logged-in viewer also stands with (0 = pure recency). */
  viewerKnownCount: number;
  /** Shown accounts the subject endorses (0 = no endorsed picks on the map). */
  subjectEndorsedCount: number;
  /** True while the anonymous SSR sample revalidates into a viewer-known one. */
  personalizing: boolean;
  /** List view matching the current orbit filter (+ search). */
  listHref: string;
}

const NetworkOrbitContext = createContext<NetworkOrbitContextValue | null>(
  null
);

export function useNetworkOrbit(): NetworkOrbitContextValue {
  const ctx = useContext(NetworkOrbitContext);
  if (!ctx) {
    throw new Error('useNetworkOrbit must be used within NetworkOrbitProvider');
  }
  return ctx;
}

function sampleCounts(accounts: NetworkAccount[]): NetworkStandingCounts {
  let mutual = 0;
  let incoming = 0;
  let outgoing = 0;
  for (const account of accounts) {
    if (account.kind === 'mutual') mutual += 1;
    else if (account.kind === 'incoming') incoming += 1;
    else outgoing += 1;
  }
  return { mutual, incoming, outgoing };
}

export function NetworkOrbitProvider({
  accountId,
  displayName: displayNameProp,
  avatarUrl = null,
  initialAccounts = null,
  initialCounts = null,
  initialCenterMood = null,
  initialViewerKnownCount = 0,
  initialSubjectEndorsedCount = 0,
  initialFilter = 'all',
  initialQuery = '',
  children,
}: NetworkOrbitProviderProps) {
  const { accountId: viewerAccountIdRaw } = useAppWallet();
  const viewerAccountId = viewerAccountIdRaw ?? null;
  const isSelf = Boolean(viewerAccountId && viewerAccountId === accountId);

  const [filter, setFilter] = useState<NetworkFilterKind>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [baseAccounts, setBaseAccounts] = useState<NetworkAccount[]>(
    initialAccounts ?? []
  );
  const [baseCounts, setBaseCounts] = useState<NetworkStandingCounts | null>(
    initialCounts
  );
  const [centerMood, setCenterMood] = useState<NetworkCenterMood | null>(
    initialCenterMood
  );
  const [viewerKnownCount, setViewerKnownCount] = useState(
    initialViewerKnownCount
  );
  const [subjectEndorsedCount, setSubjectEndorsedCount] = useState(
    initialSubjectEndorsedCount
  );
  const [searchAccounts, setSearchAccounts] = useState<NetworkAccount[] | null>(
    null
  );
  const [searchMeta, setSearchMeta] = useState<NetworkOrbitSearchMeta | null>(
    null
  );
  const [searchFetching, setSearchFetching] = useState(false);
  const [loading, setLoading] = useState(initialAccounts === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [personalizing, setPersonalizing] = useState(false);
  const personalizeAttemptedRef = useRef<string | null>(null);
  const [stageSize, setStageSize] = useState(ORBIT_STAGE_SIZE);
  const [wrapWidth, setWrapWidth] = useState<number | null>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const latestSearchLoadRef = useRef(0);

  const normalizedSearchQuery = normalizeProfileSearchQuery(query);
  const searchActive = isProfileSearchQuery(normalizedSearchQuery);

  // Server load can fail soft (null) — the client fetches the sample itself.
  useEffect(() => {
    if (initialAccounts !== null) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void fetchNetworkOrbit(
      { accountId, viewerAccountId },
      { signal: controller.signal, skipMemoryCache: true }
    )
      .then((result) => {
        if (cancelled) return;
        setBaseAccounts(result.accounts);
        setBaseCounts(result.counts);
        setCenterMood(result.centerMood ?? null);
        setViewerKnownCount(result.viewerKnownCount);
        setSubjectEndorsedCount(result.subjectEndorsedCount);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Could not load the network map.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // Initial fallback only — account swaps re-key the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // SSR is anonymous (the wallet is client-side), so once a viewer connects
  // the sample revalidates into a viewer-known ranking — a one-time settle.
  useEffect(() => {
    if (!viewerAccountId || viewerAccountId === accountId) return;
    if (searchActive) return;
    if (personalizeAttemptedRef.current === viewerAccountId) return;
    personalizeAttemptedRef.current = viewerAccountId;
    const controller = new AbortController();
    setPersonalizing(true);
    void fetchNetworkOrbit(
      { accountId, viewerAccountId },
      { signal: controller.signal }
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setBaseAccounts(result.accounts);
        setBaseCounts(result.counts);
        setCenterMood(result.centerMood ?? null);
        setViewerKnownCount(result.viewerKnownCount);
        setSubjectEndorsedCount(result.subjectEndorsedCount);
      })
      .catch(() => {
        // Keep the anonymous sample — recency order is the documented floor.
      })
      .finally(() => {
        if (!controller.signal.aborted) setPersonalizing(false);
      });
    return () => controller.abort();
  }, [accountId, viewerAccountId, searchActive]);

  useEffect(() => {
    if (!searchActive) {
      setSearchAccounts(null);
      setSearchMeta(null);
      setSearchFetching(false);
      return;
    }

    const loadId = latestSearchLoadRef.current + 1;
    latestSearchLoadRef.current = loadId;
    setSearchFetching(true);
    const controller = new AbortController();
    let fetchStarted = false;

    const timeout = window.setTimeout(() => {
      fetchStarted = true;
      void fetchNetworkOrbit(
        {
          accountId,
          viewerAccountId,
          searchQuery: normalizedSearchQuery,
          filter,
        },
        {
          signal: controller.signal,
          onRevalidate: (result) => {
            if (latestSearchLoadRef.current !== loadId) return;
            setSearchAccounts(result.accounts);
            setSearchMeta(result.search);
          },
        }
      )
        .then((result) => {
          if (latestSearchLoadRef.current !== loadId) return;
          setSearchAccounts(result.accounts);
          setSearchMeta(result.search);
        })
        .catch(() => {
          if (latestSearchLoadRef.current !== loadId) return;
          setSearchMeta(null);
        })
        .finally(() => {
          if (latestSearchLoadRef.current === loadId) {
            setSearchFetching(false);
          }
        });
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      if (fetchStarted) controller.abort();
    };
  }, [accountId, filter, normalizedSearchQuery, searchActive, viewerAccountId]);

  useEffect(() => {
    markNetworkOrbitReady();
    return () => unmarkNetworkOrbitReady();
  }, []);

  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const update = () => {
      const pad = 24;
      const next = Math.min(
        ORBIT_STAGE_SIZE,
        Math.max(
          ORBIT_MIN_STAGE_SIZE,
          Math.min(el.clientWidth - pad, el.clientHeight - pad)
        )
      );
      setStageSize(next);
      setWrapWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displayAccounts =
    searchActive && searchAccounts !== null ? searchAccounts : baseAccounts;
  const totalCounts = baseCounts ?? sampleCounts(baseAccounts);
  const counts = useMemo(() => networkFilterCounts(totalCounts), [totalCounts]);
  const totalUnique = networkUniqueConnectionTotal(totalCounts);

  const placedNodes = useMemo(
    () => placeNetworkNodes(displayAccounts, stageSize),
    [displayAccounts, stageSize]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const matchesFilter = (account: NetworkAccount): boolean => {
    if (filter === 'all') return true;
    if (filter === 'mutual') return account.kind === 'mutual';
    if (filter === 'incoming') {
      return account.kind === 'incoming' || account.kind === 'mutual';
    }
    return account.kind === 'outgoing' || account.kind === 'mutual';
  };
  const matchesQuery = (account: NetworkAccount): boolean => {
    if (!normalizedQuery) return true;
    const label = (
      account.name?.trim() || resolveDisplayName(account.accountId)
    ).toLowerCase();
    return (
      label.includes(normalizedQuery) ||
      account.accountId.toLowerCase().includes(normalizedQuery)
    );
  };
  const isDimmed = (account: NetworkAccount): boolean => {
    if (!matchesFilter(account)) return true;
    if (!searchActive && !matchesQuery(account)) return true;
    return false;
  };

  const listHref = standingPath(
    accountId,
    networkFilterToStandKind(filter),
    searchActive ? normalizedSearchQuery : undefined
  );

  const value: NetworkOrbitContextValue = {
    accountId,
    displayName: displayNameProp?.trim() || resolveDisplayName(accountId),
    avatarUrl,
    viewerAccountId,
    isSelf,
    centerMood,
    filter,
    setFilter,
    query,
    setQuery,
    counts,
    totalUnique,
    placedNodes,
    stageSize,
    // Before the wrap measures, assume the minimum inset the layout guarantees.
    stageInsetX:
      wrapWidth === null ? 12 : Math.max(12, (wrapWidth - stageSize) / 2),
    stageWrapRef,
    isDimmed,
    searchActive,
    searchFetching,
    searchMatchTotal: searchMeta?.matchTotal ?? 0,
    loading,
    loadError,
    mapShownCount: placedNodes.length,
    viewerKnownCount,
    subjectEndorsedCount,
    personalizing,
    listHref,
  };

  return (
    <NetworkOrbitContext.Provider value={value}>
      {children}
    </NetworkOrbitContext.Provider>
  );
}
