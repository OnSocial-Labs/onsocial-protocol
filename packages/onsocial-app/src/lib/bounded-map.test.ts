import { describe, expect, it } from 'vitest';

async function loadBoundedMap(): Promise<{
  writeBoundedMap: <K, V>(
    map: Map<K, V>,
    key: K,
    value: V,
    max: number
  ) => void;
  readBoundedMap: <K, V>(map: Map<K, V>, key: K) => V | undefined;
} | null> {
  try {
    return await import('./bounded-map');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /bounded-map|Cannot find|Failed to load|does not exist/i.test(message)
    ) {
      return null;
    }
    throw error;
  }
}

describe('bounded map', () => {
  it('evicts the oldest write past max', async () => {
    const map = new Map<string, number>();
    const api = await loadBoundedMap();
    expect(api).not.toBeNull();
    if (!api) return;
    api.writeBoundedMap(map, 'a', 1, 2);
    api.writeBoundedMap(map, 'b', 2, 2);
    api.writeBoundedMap(map, 'c', 3, 2);
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
    expect(map.size).toBe(2);
  });

  it('refreshes recency on read and keeps a stored null', async () => {
    const map = new Map<string, number | null>();
    const api = await loadBoundedMap();
    expect(api).not.toBeNull();
    if (!api) return;
    api.writeBoundedMap(map, 'hot', 1, 2);
    api.writeBoundedMap(map, 'cold', 2, 2);
    expect(api.readBoundedMap(map, 'hot')).toBe(1);
    api.writeBoundedMap(map, 'next', 3, 2);
    expect(map.has('hot')).toBe(true);
    expect(map.has('cold')).toBe(false);
    expect(api.readBoundedMap(map, 'missing')).toBeUndefined();

    const nulls = new Map<string, string | null>();
    api.writeBoundedMap(nulls, 'nil', null, 1);
    expect(api.readBoundedMap(nulls, 'nil')).toBeNull();
  });
});
