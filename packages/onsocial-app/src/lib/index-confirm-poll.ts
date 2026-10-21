/** How long a confirmed action waits for the indexer before using the local value. */
export const INDEX_CONFIRM_MS = 2_000;

/** Beat between Graph reads. The reader’s usual live lag is about one to two seconds. */
export const INDEX_CONFIRM_POLL_MS = 400;

/**
 * Repeat one Graph read until `matches` or the window ends.
 * A miss returns null so the caller can keep the local value.
 */
export async function pollIndexConfirm<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  opts: {
    timeoutMs?: number;
    intervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<T | null> {
  const timeoutMs = opts.timeoutMs ?? INDEX_CONFIRM_MS;
  const intervalMs = opts.intervalMs ?? INDEX_CONFIRM_POLL_MS;
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + timeoutMs;

  for (;;) {
    try {
      const value = await read();
      if (matches(value)) return value;
    } catch {
      // A failed read is a miss. Keep asking until the window ends.
    }
    const remaining = deadline - now();
    if (remaining <= 0) return null;
    await sleep(Math.min(intervalMs, remaining));
  }
}
