/**
 * Screens opened in this tab, oldest first.
 * Dock Back pops one. A later screen must not erase the place under it.
 */
export function reduceOsInAppTrail(
  hrefs: readonly string[],
  href: string,
  popping: boolean
): string[] {
  const next = href.trim();
  if (!next) return [...hrefs];
  if (popping) {
    const index = hrefs.lastIndexOf(next);
    return index >= 0 ? hrefs.slice(0, index + 1) : [next];
  }
  if (hrefs[hrefs.length - 1] === next) return [...hrefs];
  return [...hrefs, next];
}

/** The screen under the current one, if this tab opened it. */
export function previousOsInAppHref(hrefs: readonly string[]): string | null {
  if (hrefs.length < 2) return null;
  return hrefs[hrefs.length - 2] ?? null;
}
