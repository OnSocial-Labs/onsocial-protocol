export async function fetchActiveBoosterCount(): Promise<number> {
  try {
    const res = await fetch('/api/boost-network', { cache: 'no-store' });
    if (!res.ok) return 0;

    const data = (await res.json()) as { boosterCount?: number };
    return typeof data.boosterCount === 'number' &&
      Number.isFinite(data.boosterCount)
      ? data.boosterCount
      : 0;
  } catch {
    return 0;
  }
}
