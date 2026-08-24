/** Visible peek rows on Guilds / Hubs launcher homes. */
export const LAUNCHER_PEEK_DISPLAY_LIMIT = 8;

export function launcherPeekOverflowLabel(
  total: number,
  destination: 'home' | 'discover',
  limit = LAUNCHER_PEEK_DISPLAY_LIMIT
): string | null {
  const remaining = total - limit;
  if (remaining <= 0) return null;
  const place = destination === 'home' ? 'Home' : 'Discover';
  return `${remaining.toLocaleString()} more in ${place}`;
}
