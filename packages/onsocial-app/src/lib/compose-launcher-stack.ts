/** Stack so a child write dock (enlarge) does not wipe the parent pen. */

export function upsertComposeStack<T extends { id: string }>(
  stack: T[],
  item: T
): T[] {
  const index = stack.findIndex((row) => row.id === item.id);
  if (index === -1) return [...stack, item];
  const next = stack.slice();
  next[index] = item;
  return next;
}

export function popComposeStack<T extends { id: string }>(
  stack: T[],
  id: string
): T[] {
  return stack.filter((row) => row.id !== id);
}

export function topComposeStack<T>(stack: T[]): T | null {
  return stack.length > 0 ? (stack[stack.length - 1] ?? null) : null;
}
