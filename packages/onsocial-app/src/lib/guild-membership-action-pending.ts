import { useSyncExternalStore } from 'react';
import { guildMembershipCacheKey } from '@/lib/guild-membership-cache';

/**
 * Cross-surface in-flight Join / Request pending (guild page ↔ guild post).
 * Session Map — both buttons pulse while the same tx is confirming.
 */

const pendingByKey = new Map<string, true>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeGuildMembershipActionPending(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGuildMembershipActionPending(
  accountId: string | null | undefined,
  groupId: string
): boolean {
  if (!accountId?.trim() || !groupId.trim()) return false;
  return pendingByKey.has(guildMembershipCacheKey(accountId, groupId));
}

export function setGuildMembershipActionPending(
  accountId: string | null | undefined,
  groupId: string,
  pending: boolean
): void {
  if (!accountId?.trim() || !groupId.trim()) return;
  const key = guildMembershipCacheKey(accountId, groupId);
  if (pending) {
    if (pendingByKey.has(key)) return;
    pendingByKey.set(key, true);
  } else {
    if (!pendingByKey.delete(key)) return;
  }
  emit();
}

export function useGuildMembershipActionPending(
  accountId: string | null | undefined,
  groupId: string
): boolean {
  return useSyncExternalStore(
    subscribeGuildMembershipActionPending,
    () => getGuildMembershipActionPending(accountId, groupId),
    () => false
  );
}

export function clearGuildMembershipActionPendingForTests(): void {
  pendingByKey.clear();
  emit();
}
