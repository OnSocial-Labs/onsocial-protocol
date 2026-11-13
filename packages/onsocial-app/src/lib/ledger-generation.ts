/**
 * Read a store snapshot for one published generation.
 * The generation does not change the snapshot. It is the input that makes a
 * memo re-read the store after a subscribe tick. An unpublished generation
 * still returns the current snapshot, so a clock value cannot blank the copy.
 */
export function snapshotForGeneration<T>(generation: number, read: () => T): T {
  const snapshot = read();
  if (!Number.isSafeInteger(generation) || generation < 0) return snapshot;
  return snapshot;
}
