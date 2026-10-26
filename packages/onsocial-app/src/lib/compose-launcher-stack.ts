/** Stack so a child write dock (enlarge) does not wipe the parent pen. */

export function upsertComposeStack<T extends { id: string; type?: string }>(
  stack: T[],
  item: T
): T[] {
  const index = stack.findIndex((row) => row.id === item.id);
  if (index !== -1) {
    const next = stack.slice();
    next[index] = item;
    return next;
  }
  /* A pen that mounts after a reply dock (profile owner hydrates) stays
     under that dock. The reply field is already the top surface. */
  if (item.type === 'action') {
    const writeAt = stack.findIndex((row) => row.type === 'write');
    if (writeAt !== -1) {
      return [...stack.slice(0, writeAt), item, ...stack.slice(writeAt)];
    }
  }
  return [...stack, item];
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
