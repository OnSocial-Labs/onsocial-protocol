export async function fetchActiveBoosterCount(): Promise<number | null> {
  try {
    const res = await fetch('/api/boost-network', { cache: 'no-store' });
    if (!res.ok) return null;

    const data = (await res.json()) as { boosterCount?: unknown };
    return typeof data.boosterCount === 'number' &&
      Number.isFinite(data.boosterCount)
      ? data.boosterCount
      : null;
  } catch {
    return null;
  }
}
