'use client';

import { useCallback, useRef, useState } from 'react';
import type { GroupBannedRow, GroupMemberRow } from '@onsocial/sdk';
import type { GuildMemberRowActionId } from '@/features/guilds/guild-member-row-actions';
import { listActivePermissionChangeProposals } from '@/features/guilds/guild-member-pending-roles';
import type { GuildMemberPendingRole } from '@/features/guilds/guild-member-pending-roles';
import {
  patchGuildMemberRosterAction,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';

export interface GuildMembersDataState {
  members: GroupMemberRow[];
  banned: GroupBannedRow[];
  pendingRolesByMemberId: Map<string, GuildMemberPendingRole>;
  loadError: string | null;
  showListSkeleton: boolean;
  isListRefreshing: boolean;
  countsLoading: boolean;
  bootstrap: (
    seedMembers?: GroupMemberRow[],
    seedBanned?: GroupBannedRow[]
  ) => void;
  reload: () => void;
  applyMemberActionPatch: (
    memberId: string,
    actionId: GuildMemberRowActionId,
    options?: { scheduleRetry?: boolean }
  ) => void;
}

export function useGuildMembersData(
  groupId: string,
  options: {
    memberDriven?: boolean;
    ownerId?: string | null;
  } = {}
): GuildMembersDataState {
  const memberDriven = options.memberDriven ?? false;
  const ownerId = options.ownerId ?? null;
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [banned, setBanned] = useState<GroupBannedRow[]>([]);
  const [pendingRolesByMemberId, setPendingRolesByMemberId] = useState<
    Map<string, GuildMemberPendingRole>
  >(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isListRefreshing, setIsListRefreshing] = useState(false);
  const retryTimersRef = useRef<number[]>([]);

  const clearRetryTimers = useCallback(() => {
    for (const timerId of retryTimersRef.current) {
      window.clearTimeout(timerId);
    }
    retryTimersRef.current = [];
  }, []);

  const fetchMembers = useCallback(
    async (soft: boolean) => {
      setLoadError(null);
      if (soft) {
        setIsListRefreshing(true);
      }

      try {
        const client = createReadOnlyOnSocialClient();
        // Indexer views are authoritative for roster + bans — never N×
        // isBlacklisted / isAdmin under the API key.
        const [shellRows, page, bannedPage, proposals] = await Promise.all([
          client.query.groups.byIds([groupId]).catch(() => []),
          client.query.groups.membersOf(groupId, { limit: 120 }),
          client.query.groups.bannedOf(groupId, { limit: 120 }).catch(() => ({
            items: [] as GroupBannedRow[],
          })),
          memberDriven
            ? client.groups.listProposals(groupId, { limit: 40 })
            : Promise.resolve([]),
        ]);
        const shellOwner =
          shellRows[0]?.ownerId?.trim() || ownerId?.trim() || null;
        const roster = reconcileGuildMemberRoster(
          page.items ?? [],
          shellOwner
        );
        setMembers(roster);
        setBanned(bannedPage.items ?? []);
        setPendingRolesByMemberId(
          memberDriven
            ? listActivePermissionChangeProposals(proposals)
            : new Map()
        );
        setHasLoaded(true);
      } catch (cause) {
        setLoadError(
          cause instanceof Error ? cause.message : 'Could not load members.'
        );
        if (!soft) {
          setMembers([]);
          setBanned([]);
          setPendingRolesByMemberId(new Map());
        }
      } finally {
        setIsListRefreshing(false);
      }
    },
    [groupId, memberDriven, ownerId]
  );

  /** After role/ban actions: optimistic patch, then catch up indexer flags. */
  const scheduleSoftRetries = useCallback(() => {
    clearRetryTimers();
    retryTimersRef.current = INDEXER_SOFT_RETRY_MS.map((delay) =>
      window.setTimeout(() => {
        void fetchMembers(true);
      }, delay)
    );
  }, [clearRetryTimers, fetchMembers]);

  const bootstrap = useCallback(
    (
      seedMembers: GroupMemberRow[] = [],
      seedBanned: GroupBannedRow[] = []
    ) => {
      clearRetryTimers();
      if (seedMembers.length > 0 || seedBanned.length > 0) {
        setMembers(seedMembers);
        setBanned(seedBanned);
        setHasLoaded(true);
      } else {
        setMembers([]);
        setBanned([]);
        setHasLoaded(false);
      }
      setPendingRolesByMemberId(new Map());
      setLoadError(null);
      void fetchMembers(seedMembers.length > 0 || seedBanned.length > 0);
    },
    [clearRetryTimers, fetchMembers]
  );

  const reload = useCallback(() => {
    void fetchMembers(members.length > 0 || banned.length > 0);
  }, [banned.length, fetchMembers, members.length]);

  const applyMemberActionPatch = useCallback(
    (
      memberId: string,
      actionId: GuildMemberRowActionId,
      options?: { scheduleRetry?: boolean }
    ) => {
      if (actionId === 'ban-from-guild') {
        setMembers((current) =>
          patchGuildMemberRosterAction(current, memberId, actionId)
        );
        setBanned((current) => {
          if (current.some((row) => row.memberId === memberId)) return current;
          return [
            {
              groupId,
              memberId,
              blockHeight: 0,
              blockTimestamp: Date.now() * 1_000_000,
            },
            ...current,
          ];
        });
      } else if (actionId === 'unban-from-guild') {
        setBanned((current) =>
          current.filter((row) => row.memberId !== memberId)
        );
      } else {
        setMembers((current) =>
          patchGuildMemberRosterAction(current, memberId, actionId)
        );
      }
      if (options?.scheduleRetry !== false) {
        scheduleSoftRetries();
      }
    },
    [groupId, scheduleSoftRetries]
  );

  const showListSkeleton =
    !hasLoaded && members.length === 0 && banned.length === 0 && !loadError;
  const countsLoading =
    !hasLoaded && members.length === 0 && banned.length === 0;

  return {
    members,
    banned,
    pendingRolesByMemberId,
    loadError,
    showListSkeleton,
    isListRefreshing,
    countsLoading,
    bootstrap,
    reload,
    applyMemberActionPatch,
  };
}
