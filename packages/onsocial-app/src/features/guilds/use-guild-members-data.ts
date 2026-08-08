'use client';

import { useCallback, useRef, useState } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
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
  pendingRolesByMemberId: Map<string, GuildMemberPendingRole>;
  loadError: string | null;
  showListSkeleton: boolean;
  isListRefreshing: boolean;
  countsLoading: boolean;
  bootstrap: (seedMembers?: GroupMemberRow[]) => void;
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
        // Indexer `group_members_current` is authoritative for roster roles —
        // never N× isAdmin/canModerate under the API key.
        const [shellRows, page, proposals] = await Promise.all([
          client.query.groups.byIds([groupId]).catch(() => []),
          client.query.groups.membersOf(groupId, { limit: 120 }),
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
          setPendingRolesByMemberId(new Map());
        }
      } finally {
        setIsListRefreshing(false);
      }
    },
    [groupId, memberDriven, ownerId]
  );

  /** After role actions: optimistic patch, then catch up indexer flags. */
  const scheduleSoftRetries = useCallback(() => {
    clearRetryTimers();
    retryTimersRef.current = INDEXER_SOFT_RETRY_MS.map((delay) =>
      window.setTimeout(() => {
        void fetchMembers(true);
      }, delay)
    );
  }, [clearRetryTimers, fetchMembers]);

  const bootstrap = useCallback(
    (seedMembers: GroupMemberRow[] = []) => {
      clearRetryTimers();
      if (seedMembers.length > 0) {
        setMembers(seedMembers);
        setHasLoaded(true);
      } else {
        setMembers([]);
        setHasLoaded(false);
      }
      setPendingRolesByMemberId(new Map());
      setLoadError(null);
      void fetchMembers(seedMembers.length > 0);
    },
    [clearRetryTimers, fetchMembers]
  );

  const reload = useCallback(() => {
    void fetchMembers(members.length > 0);
  }, [fetchMembers, members.length]);

  const applyMemberActionPatch = useCallback(
    (
      memberId: string,
      actionId: GuildMemberRowActionId,
      options?: { scheduleRetry?: boolean }
    ) => {
      setMembers((current) =>
        patchGuildMemberRosterAction(current, memberId, actionId)
      );
      if (options?.scheduleRetry !== false) {
        scheduleSoftRetries();
      }
    },
    [scheduleSoftRetries]
  );

  const showListSkeleton = !hasLoaded && members.length === 0 && !loadError;
  const countsLoading = !hasLoaded && members.length === 0;

  return {
    members,
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
