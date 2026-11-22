/**
 * Map insertion order is recency (newest last).
 *
 * The app already caps a few session maps this way, but each copy is private
 * (guild shell, guild page, scarce embeds, author profiles). These session
 * caches need the same rule and must not import those features.
 */

/** Insert or replace `key`, then drop the oldest entries past `max`. */
export function writeBoundedMap<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  max: number
): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/**
 * LRU read. A miss stays a miss. A hit, including a stored `null`, moves to
 * newest. Callers that only expire by time should not use this.
 */
export function readBoundedMap<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined;
  const value = map.get(key) as V;
  map.delete(key);
  map.set(key, value);
  return value;
}
