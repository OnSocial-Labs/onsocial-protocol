import type { DiscoverTab } from '@/features/discover/discover-tabs';

export type DiscoverTabScrollMap = Partial<Record<DiscoverTab, number>>;

export function rememberDiscoverTabScroll(
  stored: DiscoverTabScrollMap,
  tab: DiscoverTab,
  scrollTop: number
): DiscoverTabScrollMap {
  if (!Number.isFinite(scrollTop) || scrollTop < 0) return stored;
  if (stored[tab] === scrollTop) return stored;
  return { ...stored, [tab]: scrollTop };
}

export function readDiscoverTabScroll(
  stored: DiscoverTabScrollMap,
  tab: DiscoverTab
): number {
  const value = stored[tab];
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function readElementScrollTop(
  element: Element | null | undefined
): number {
  return element instanceof HTMLElement ? element.scrollTop : 0;
}

export function writeElementScrollTop(
  element: Element | null | undefined,
  scrollTop: number
): void {
  if (!(element instanceof HTMLElement)) return;
  element.scrollTop = scrollTop;
}

/** Write now and once after paint — chrome tuck / height sync can reset scrollTop. */
export function scheduleDiscoverTabScrollRestore(
  element: Element | null | undefined,
  scrollTop: number
): () => void {
  writeElementScrollTop(element, scrollTop);
  if (typeof requestAnimationFrame !== 'function') {
    return () => {};
  }
  const frame = requestAnimationFrame(() => {
    writeElementScrollTop(element, scrollTop);
  });
  return () => cancelAnimationFrame(frame);
}
