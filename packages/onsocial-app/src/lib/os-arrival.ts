/** `/` is the Home bounce — not a place you leave to. */
export function normalizeOsPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed === '/' ? '/home' : trimmed;
}

export function advanceOsArrival(
  previousLast: string | null,
  previousFrom: string | null,
  pathname: string
): { last: string; from: string | null } {
  const current = normalizeOsPath(pathname);
  if (previousLast === current) {
    return { last: current, from: previousFrom };
  }
  return {
    last: current,
    from: previousLast && previousLast !== current ? previousLast : null,
  };
}

/** Leave target for a root (Home / Discover) after arriving from elsewhere. */
export function rootLeaveHref(
  currentPath: string,
  from: string | null
): string | null {
  if (!from) return null;
  const current = normalizeOsPath(currentPath);
  return from === current ? null : from;
}

let last: string | null = null;
let from: string | null = null;

export function resetOsArrivalForTests() {
  last = null;
  from = null;
}

export function syncOsArrival(pathname: string): string | null {
  const next = advanceOsArrival(last, from, pathname);
  last = next.last;
  from = next.from;
  return from;
}

export function peekOsArrivalFrom(): string | null {
  return from;
}
