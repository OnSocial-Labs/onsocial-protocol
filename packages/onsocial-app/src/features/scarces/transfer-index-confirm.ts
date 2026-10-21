import { accountIdsEqual } from '@/lib/account-match';
import { pollIndexConfirm } from '@/lib/index-confirm-poll';

/** True when the indexed owner row is the account the transfer was sent to. */
export function scarceOwnerIs(
  ownerId: string | null | undefined,
  receiverId: string
): boolean {
  if (!ownerId?.trim() || !receiverId.trim()) return false;
  return accountIdsEqual(ownerId, receiverId);
}

/**
 * After a transfer is final, wait until the token’s owner row is the receiver.
 * A miss returns false so the caller still applies the local handoff.
 */
export async function pollTransferOwner(args: {
  receiverId: string;
  readOwnerId: () => Promise<string | null>;
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<boolean> {
  const matched = await pollIndexConfirm(
    () => args.readOwnerId(),
    (ownerId) => scarceOwnerIs(ownerId, args.receiverId),
    {
      ...(args.timeoutMs != null ? { timeoutMs: args.timeoutMs } : {}),
      ...(args.intervalMs != null ? { intervalMs: args.intervalMs } : {}),
      ...(args.now ? { now: args.now } : {}),
      ...(args.sleep ? { sleep: args.sleep } : {}),
    }
  );
  return matched != null && scarceOwnerIs(matched, args.receiverId);
}
