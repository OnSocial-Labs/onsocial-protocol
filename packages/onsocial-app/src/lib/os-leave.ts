import { APP_HOME_PATH } from '@/lib/app-routes';

/**
 * Daily indexes (Guilds, Hubs, DAOs, …) leave to Home.
 * Never the gate (`/`).
 */
export const OS_INDEX_LEAVE_HREF = APP_HOME_PATH;

/**
 * OS leave — one motion: go up to the parent place.
 * History-back is not the default (deep links / launcher open can leave the OS).
 * Stack panes pass `onBack` (e.g. close a Messages thread).
 */
export function resolveOsLeave({
  onBack,
  fallbackHref,
}: {
  onBack?: () => void;
  fallbackHref: string;
}): { kind: 'callback' } | { kind: 'parent'; href: string } {
  if (onBack) return { kind: 'callback' };
  return { kind: 'parent', href: fallbackHref };
}
