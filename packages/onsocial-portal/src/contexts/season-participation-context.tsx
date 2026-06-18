'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ArchiveSeasonClaimHint } from '@/features/season/season-archive-claim-hints';
import type { SeasonZeroClaimRecord } from '@/features/season/season-zero-types';
import {
  deriveSeasonClaimRecord,
  hasSeasonClaimOverride,
  hasSeasonJoinOverride,
  reconcileSeasonClaimed,
  reconcileSeasonJoined,
  recordSeasonClaimed,
  recordSeasonJoined,
  resolveArchiveSeasonClaimHint,
  resolveSeasonJoined,
} from '@/lib/season-participation-ledger';

type SeasonParticipationContextValue = {
  participateSyncVersion: number;
  beginSeasonClaim: (seasonId: string) => void;
  confirmSeasonClaim: (seasonId: string) => void;
  endSeasonClaim: (seasonId: string) => void;
  isSeasonClaimPending: (seasonId: string) => boolean;
  shouldFreshFetchSeasonClaim: (seasonId: string) => boolean;
  deriveSeasonClaim: (
    claim: SeasonZeroClaimRecord | null | undefined
  ) => SeasonZeroClaimRecord | null;
  reconcileSeasonClaimFromApi: (seasonId: string, apiClaimed: boolean) => void;
  resolveArchiveClaimHint: (
    seasonId: string,
    apiHint: ArchiveSeasonClaimHint
  ) => ArchiveSeasonClaimHint;
  beginSeasonJoin: (seasonId: string) => void;
  confirmSeasonJoin: (seasonId: string) => void;
  endSeasonJoin: (seasonId: string) => void;
  isSeasonJoinPending: (seasonId: string) => boolean;
  resolveSeasonJoinedFor: (seasonId: string, apiJoined: boolean) => boolean;
  hasSeasonJoinConfirmed: (seasonId: string) => boolean;
  reconcileSeasonJoinFromApi: (seasonId: string, apiJoined: boolean) => void;
};

const SeasonParticipationContext =
  createContext<SeasonParticipationContextValue | null>(null);

export function SeasonParticipationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const confirmedClaimsRef = useRef<Map<string, true>>(new Map());
  const confirmedJoinsRef = useRef<Map<string, true>>(new Map());
  const pendingClaimsRef = useRef<Set<string>>(new Set());
  const pendingJoinsRef = useRef<Set<string>>(new Set());
  const [participateSyncVersion, setParticipateSyncVersion] = useState(0);

  const bumpParticipateSync = useCallback(() => {
    setParticipateSyncVersion((version) => version + 1);
  }, []);

  const beginSeasonClaim = useCallback(
    (seasonId: string) => {
      pendingClaimsRef.current.add(seasonId);
      bumpParticipateSync();
    },
    [bumpParticipateSync]
  );

  const confirmSeasonClaim = useCallback(
    (seasonId: string) => {
      recordSeasonClaimed(confirmedClaimsRef.current, seasonId);
      bumpParticipateSync();
    },
    [bumpParticipateSync]
  );

  const endSeasonClaim = useCallback(
    (seasonId: string) => {
      pendingClaimsRef.current.delete(seasonId);
      bumpParticipateSync();
    },
    [bumpParticipateSync]
  );

  const isSeasonClaimPending = useCallback(
    (seasonId: string) => pendingClaimsRef.current.has(seasonId),
    []
  );

  const shouldFreshFetchSeasonClaim = useCallback(
    (seasonId: string) =>
      hasSeasonClaimOverride(confirmedClaimsRef.current, seasonId),
    []
  );

  const deriveSeasonClaim = useCallback(
    (claim: SeasonZeroClaimRecord | null | undefined) =>
      deriveSeasonClaimRecord(claim, confirmedClaimsRef.current),
    []
  );

  const reconcileSeasonClaimFromApi = useCallback(
    (seasonId: string, apiClaimed: boolean) => {
      const reconciled = reconcileSeasonClaimed(
        confirmedClaimsRef.current,
        seasonId,
        apiClaimed
      );
      if (reconciled) {
        bumpParticipateSync();
      }
    },
    [bumpParticipateSync]
  );

  const resolveArchiveClaimHint = useCallback(
    (seasonId: string, apiHint: ArchiveSeasonClaimHint) =>
      resolveArchiveSeasonClaimHint(
        seasonId,
        apiHint,
        confirmedClaimsRef.current
      ),
    []
  );

  const beginSeasonJoin = useCallback(
    (seasonId: string) => {
      pendingJoinsRef.current.add(seasonId);
      bumpParticipateSync();
    },
    [bumpParticipateSync]
  );

  const confirmSeasonJoin = useCallback(
    (seasonId: string) => {
      recordSeasonJoined(confirmedJoinsRef.current, seasonId);
      bumpParticipateSync();
    },
    [bumpParticipateSync]
  );

  const endSeasonJoin = useCallback(
    (seasonId: string) => {
      pendingJoinsRef.current.delete(seasonId);
      bumpParticipateSync();
    },
    [bumpParticipateSync]
  );

  const isSeasonJoinPending = useCallback(
    (seasonId: string) => pendingJoinsRef.current.has(seasonId),
    []
  );

  const resolveSeasonJoinedFor = useCallback(
    (seasonId: string, apiJoined: boolean) =>
      resolveSeasonJoined(confirmedJoinsRef.current, seasonId, apiJoined),
    []
  );

  const hasSeasonJoinConfirmed = useCallback(
    (seasonId: string) =>
      hasSeasonJoinOverride(confirmedJoinsRef.current, seasonId),
    []
  );

  const reconcileSeasonJoinFromApi = useCallback(
    (seasonId: string, apiJoined: boolean) => {
      const reconciled = reconcileSeasonJoined(
        confirmedJoinsRef.current,
        seasonId,
        apiJoined
      );
      if (reconciled) {
        bumpParticipateSync();
      }
    },
    [bumpParticipateSync]
  );

  return (
    <SeasonParticipationContext.Provider
      value={{
        participateSyncVersion,
        beginSeasonClaim,
        confirmSeasonClaim,
        endSeasonClaim,
        isSeasonClaimPending,
        shouldFreshFetchSeasonClaim,
        deriveSeasonClaim,
        reconcileSeasonClaimFromApi,
        resolveArchiveClaimHint,
        beginSeasonJoin,
        confirmSeasonJoin,
        endSeasonJoin,
        isSeasonJoinPending,
        resolveSeasonJoinedFor,
        hasSeasonJoinConfirmed,
        reconcileSeasonJoinFromApi,
      }}
    >
      {children}
    </SeasonParticipationContext.Provider>
  );
}

export function useSeasonParticipation(): SeasonParticipationContextValue {
  const context = useContext(SeasonParticipationContext);
  if (!context) {
    throw new Error(
      'useSeasonParticipation must be used within a SeasonParticipationProvider'
    );
  }
  return context;
}
