'use client';

import {
  createContext,
  useCallback,
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
import {
  networkAccountIdFromPath,
  networkPath,
} from '@/lib/overlay-routes';

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
  /** True while a tapped face's spokes fade and the next sample is in flight. */
  ringsFading: boolean;
  /** Put this face in the center now. Rings fill when their sample arrives. */
  openSubject: (account: NetworkAccount) => void;
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
  const initialName =
    displayNameProp?.trim() || resolveDisplayName(accountId);
  const [subjectId, setSubjectId] = useState(accountId);
  const [subjectName, setSubjectName] = useState(initialName);
  const [subjectAvatar, setSubjectAvatar] = useState<string | null>(avatarUrl);
  const [ringsFading, setRingsFading] = useState(false);
  const isSelf = Boolean(viewerAccountId && viewerAccountId === subjectId);
  const facesRef = useRef(
    new Map<string, { name: string; avatarUrl: string | null }>([
      [accountId, { name: initialName, avatarUrl }],
    ])
  );
  const subjectIdRef = useRef(subjectId);
  subjectIdRef.current = subjectId;
  const initialSubjectRef = useRef(accountId);

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
        if (subjectIdRef.current !== accountId) return;
        setBaseAccounts(result.accounts);
        setBaseCounts(result.counts);
        setCenterMood(result.centerMood ?? null);
        setViewerKnownCount(result.viewerKnownCount);
        setSubjectEndorsedCount(result.subjectEndorsedCount);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('The map did not load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // Initial fallback only. A face tap fetches in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const appliedSubjectRef = useRef(accountId);
  const viewerAccountIdRef = useRef(viewerAccountId);
  viewerAccountIdRef.current = viewerAccountId;

  // A tapped face keeps the center and fades the spokes until this sample lands.
  // Returning to the first person refetches too — their rings were replaced.
  useEffect(() => {
    if (appliedSubjectRef.current === subjectId) return;
    let cancelled = false;
    const controller = new AbortController();
    setRingsFading(true);
    setLoadError(null);
    const viewerAccountId = viewerAccountIdRef.current;
    personalizeAttemptedRef.current = viewerAccountId;
    void fetchNetworkOrbit(
      { accountId: subjectId, viewerAccountId },
      { signal: controller.signal, skipMemoryCache: true }
    )
      .then((result) => {
        if (cancelled) return;
        appliedSubjectRef.current = subjectId;
        setBaseAccounts(result.accounts);
        setBaseCounts(result.counts);
        setCenterMood(result.centerMood ?? null);
        setViewerKnownCount(result.viewerKnownCount);
        setSubjectEndorsedCount(result.subjectEndorsedCount);
        setRingsFading(false);
      })
      .catch(() => {
        if (cancelled) return;
        appliedSubjectRef.current = subjectId;
        setBaseAccounts([]);
        setBaseCounts(null);
        setViewerKnownCount(0);
        setSubjectEndorsedCount(0);
        setLoadError('The map did not load.');
        setRingsFading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [subjectId]);

  // SSR is anonymous (the wallet is client-side), so once a viewer connects
  // the sample revalidates into a viewer-known ranking — a one-time settle.
  // A subject swap aborts this so it cannot paint the previous map back.
  useEffect(() => {
    if (subjectId !== accountId) return;
    if (!viewerAccountId || viewerAccountId === accountId) return;
    if (searchActive) return;
    if (personalizeAttemptedRef.current === viewerAccountId) return;
    const controller = new AbortController();
    setPersonalizing(true);
    void fetchNetworkOrbit(
      { accountId, viewerAccountId },
      { signal: controller.signal, skipMemoryCache: true }
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (subjectIdRef.current !== accountId) return;
        personalizeAttemptedRef.current = viewerAccountId;
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
  }, [accountId, subjectId, viewerAccountId, searchActive]);

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
          accountId: subjectId,
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
  }, [subjectId, filter, normalizedSearchQuery, searchActive, viewerAccountId]);

  const showSubject = useCallback(
    (
      id: string,
      name: string,
      avatar: string | null,
      history: 'push' | 'stay'
    ) => {
      if (id === subjectIdRef.current) return;
      facesRef.current.set(id, { name, avatarUrl: avatar });
      setSubjectId(id);
      setSubjectName(name);
      setSubjectAvatar(avatar);
      setCenterMood(null);
      setRingsFading(true);
      setLoadError(null);
      setPersonalizing(false);
      setQuery('');
      setFilter('all');
      setSearchAccounts(null);
      setSearchMeta(null);
      setSearchFetching(false);
      if (history === 'stay') return;
      const href = networkPath(id);
      if (window.location.pathname !== href) {
        const prior = window.history.state;
        const data =
          prior && typeof prior === 'object'
            ? { ...prior, networkOrbit: id }
            : { networkOrbit: id };
        // Next's pushState starts a server restore and freezes the previous map.
        History.prototype.pushState.call(window.history, data, '', href);
      }
    },
    []
  );

  const openSubject = useCallback(
    (account: NetworkAccount) => {
      const name = account.name?.trim() || resolveDisplayName(account.accountId);
      showSubject(account.accountId, name, account.avatarUrl, 'push');
    },
    [showSubject]
  );

  useEffect(() => {
    for (const account of baseAccounts) {
      facesRef.current.set(account.accountId, {
        name: account.name?.trim() || resolveDisplayName(account.accountId),
        avatarUrl: account.avatarUrl,
      });
    }
  }, [baseAccounts]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const id = networkAccountIdFromPath(window.location.pathname);
      if (!id) {
        // Left the map. Next's own popstate listener restores the screen.
        return;
      }
      // Keep the center swap on this page. Next would refetch the route.
      event.stopImmediatePropagation();
      if (id === subjectIdRef.current) return;
      const face = facesRef.current.get(id);
      showSubject(
        id,
        face?.name ?? resolveDisplayName(id),
        face?.avatarUrl ?? null,
        'stay'
      );
    };
    window.addEventListener('popstate', onPop, true);
    return () => window.removeEventListener('popstate', onPop, true);
  }, [showSubject]);

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
    subjectId,
    networkFilterToStandKind(filter),
    searchActive ? normalizedSearchQuery : undefined
  );

  const value: NetworkOrbitContextValue = {
    accountId: subjectId,
    displayName: subjectName,
    avatarUrl: subjectAvatar,
    ringsFading,
    openSubject,
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
