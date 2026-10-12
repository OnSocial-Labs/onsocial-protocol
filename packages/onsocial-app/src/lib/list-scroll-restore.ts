import { getAppLenis } from '@/lib/app-lenis-registry';

export const LIST_SCROLL_RESTORE_SLOP_PX = 2;

export type ListScrollMemory = {
  /** Saved line not yet sitting on the scroller. */
  pending: number | null;
  /** Last line we actually reached, or the line the user left. */
  landed: number;
  /** Wheel / touch / keys — trust the live scroller, including the top. */
  userAdjusted: boolean;
};

export function createListScrollMemory(savedTop: number): ListScrollMemory {
  const saved = Number.isFinite(savedTop) && savedTop > 0 ? savedTop : 0;
  return {
    pending: saved > 0 ? saved : null,
    landed: saved,
    userAdjusted: false,
  };
}

export function resetListScrollMemory(
  memory: ListScrollMemory,
  savedTop: number
): void {
  const next = createListScrollMemory(savedTop);
  memory.pending = next.pending;
  memory.landed = next.landed;
  memory.userAdjusted = next.userAdjusted;
}

export function listScrollMax(node: HTMLElement): number {
  return Math.max(0, node.scrollHeight - node.clientHeight);
}

/** True only when the scroller is on that line, not merely tall enough. */
export function listScrollRestoreLanded(
  node: HTMLElement,
  target: number
): boolean {
  if (!Number.isFinite(target) || target <= 0) return true;
  const max = listScrollMax(node);
  if (max + LIST_SCROLL_RESTORE_SLOP_PX < target) return false;
  return Math.abs(node.scrollTop - target) <= LIST_SCROLL_RESTORE_SLOP_PX;
}

export function applyListScrollRestore(
  node: HTMLElement,
  target: number
): boolean {
  const goal = Math.max(0, Math.round(target));
  if (goal <= 0) {
    delete node.dataset.osScrollRestore;
    return true;
  }
  node.dataset.osScrollRestore = String(goal);
  const lenis = getAppLenis(node);
  const lenisReady = Boolean(
    lenis && lenis.limit + LIST_SCROLL_RESTORE_SLOP_PX >= goal
  );
  if (lenis && lenisReady) {
    lenis.resize();
    lenis.scrollTo(goal, { immediate: true, force: true });
  } else if (node.scrollTop !== goal) {
    node.scrollTop = goal;
  }
  const landed = listScrollRestoreLanded(node, goal);
  // Lenis binds a frame later and would jump back to the top if the marker
  // was already gone. Keep it until Lenis has actually taken the line.
  if (landed && (!lenis || lenisReady)) {
    delete node.dataset.osScrollRestore;
  }
  return Boolean(landed && (!lenis || lenisReady));
}

/**
 * The line to store when leaving a list. A scroller cleared on the way out
 * keeps the line already read.
 */
export function scrollLineOnLeave(live: number, remembered: number): number {
  const top = Number.isFinite(live) ? Math.max(0, live) : 0;
  if (top > 0) return top;
  const kept = Number.isFinite(remembered) ? Math.max(0, remembered) : 0;
  return kept;
}

/**
 * A mount that never reached the saved line must not write 0 over it.
 * A real user scroll, including back to the top, wins.
 */
export function scrollTopToPersist(
  memory: ListScrollMemory,
  live: number
): number {
  const top = Number.isFinite(live) ? Math.max(0, live) : 0;
  if (memory.userAdjusted) return top;
  if (
    memory.pending != null &&
    memory.pending > 0 &&
    top + LIST_SCROLL_RESTORE_SLOP_PX < memory.pending
  ) {
    return memory.pending;
  }
  if (top > 0) return top;
  return memory.landed > 0 ? memory.landed : 0;
}
