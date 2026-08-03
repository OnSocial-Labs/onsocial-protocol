/**
 * Album track reorder — gap index `insertAt` is 0…length in the current
 * list (the slot before that row, or `length` for the end).
 *
 * Create-drop UI order is `trackFiles` top→bottom; pin writes that same
 * array into `extra.playable`.
 */
export function reorderByInsert<T>(
  list: T[],
  from: number,
  insertAt: number
): T[] {
  if (from < 0 || from >= list.length) return list;
  // Dropping into either gap beside the dragged row is a no-op.
  if (insertAt === from || insertAt === from + 1) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  const to = insertAt > from ? insertAt - 1 : insertAt;
  next.splice(to, 0, item!);
  return next;
}
