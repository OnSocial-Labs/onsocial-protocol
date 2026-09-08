import { accountIdsEqual } from '@/lib/account-match';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { normalizeAccountRoute } from '@/lib/account-route';
import { isHeuristicDaoAccountId } from '@/lib/enrich-standing-with-dao';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';
import type { OsAppLink } from '@/lib/os-apps';

const STORAGE_KEY = 'onsocial.os.last-place';

/** Portfolio panels that are other launcher apps, not “that page”. */
const SKIP_PAGE_PANELS = new Set(['feed', 'discover', 'collectibles']);

export type OsLastPlace = {
  href: string;
  accountId: string;
  label: string;
  profileName?: string | null;
  avatarUrl?: string | null;
};

export function parsePortfolioAccountFromPath(pathname: string): {
  accountId: string;
  panel: string | null;
} | null {
  const path = pathname.split(/[?#]/)[0] ?? pathname;
  const parts = path.split('/').filter(Boolean);
  if (!parts[0]) return null;
  const accountId = normalizeAccountRoute(parts[0]);
  if (!accountId) return null;
  return { accountId, panel: parts[1] ?? null };
}

function isDaoOrProtocolAccount(accountId: string): boolean {
  const accountLower = accountId.trim().toLowerCase();
  if (
    accountLower === GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase() ||
    accountLower === TREASURY_DAO_ACCOUNT.trim().toLowerCase()
  ) {
    return true;
  }
  return isHeuristicDaoAccountId(accountLower);
}

/** A portfolio face (or page overlay) worth remembering after a launcher hop. */
export function osLastPlaceFromPathname(pathname: string): OsLastPlace | null {
  const parsed = parsePortfolioAccountFromPath(pathname);
  if (!parsed) return null;
  if (parsed.panel && SKIP_PAGE_PANELS.has(parsed.panel)) return null;
  // Href is always the face — do not remember DAO/protocol as last-place.
  if (isDaoOrProtocolAccount(parsed.accountId)) return null;
  return {
    href: portfolioPath(parsed.accountId),
    accountId: parsed.accountId,
    label: resolveOsLastPlaceSpokenLabel(parsed.accountId),
  };
}

/** Spoken page name — chosen profile name, else local part (`Alice`). */
export function resolveOsLastPlaceSpokenLabel(
  accountId: string,
  profileName?: string | null
): string {
  return displayName(accountId, profileName);
}

export function osLastPlaceIsReturnable(
  place: OsLastPlace | null,
  pathname: string,
  viewerAccountId?: string | null
): boolean {
  if (!place) return false;
  const current = parsePortfolioAccountFromPath(pathname);
  if (current && accountIdsEqual(current.accountId, place.accountId)) {
    return false;
  }
  if (viewerAccountId && accountIdsEqual(place.accountId, viewerAccountId)) {
    return false;
  }
  return true;
}

export function osLastPlaceLauncherApp(place: OsLastPlace): OsAppLink {
  return {
    id: 'last-place',
    label: place.label,
    kind: 'app',
    href: place.href,
  };
}

type Listener = () => void;

let memory: OsLastPlace | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

function readStorage(): OsLastPlace | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OsLastPlace>;
    const accountId =
      typeof parsed.accountId === 'string' ? parsed.accountId.trim() : '';
    const href = typeof parsed.href === 'string' ? parsed.href.trim() : '';
    const label = typeof parsed.label === 'string' ? parsed.label.trim() : '';
    if (!accountId || !href || !label) return null;
    const profileName =
      typeof parsed.profileName === 'string' ? parsed.profileName.trim() : null;
    const avatarUrl =
      typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl.trim() : null;
    return {
      accountId,
      href,
      label,
      profileName: profileName || null,
      avatarUrl: avatarUrl || null,
    };
  } catch {
    return null;
  }
}

export function readOsLastPlace(): OsLastPlace | null {
  if (memory) return memory;
  memory = readStorage();
  return memory;
}

export function patchOsLastPlaceFace(
  accountId: string,
  face: { profileName?: string | null; avatarUrl?: string | null }
): void {
  const current = readOsLastPlace();
  if (!current || !accountIdsEqual(current.accountId, accountId)) return;
  const profileName = face.profileName?.trim() || current.profileName || null;
  const avatarUrl =
    face.avatarUrl !== undefined
      ? face.avatarUrl?.trim() || null
      : (current.avatarUrl ?? null);
  const label = resolveOsLastPlaceSpokenLabel(current.accountId, profileName);
  if (
    current.profileName === profileName &&
    current.avatarUrl === avatarUrl &&
    current.label === label
  ) {
    return;
  }
  writeOsLastPlace({
    ...current,
    profileName,
    avatarUrl,
    label,
  });
}

export function writeOsLastPlace(place: OsLastPlace): void {
  memory = place;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(place));
    } catch {
      // private mode
    }
  }
  notify();
}

export function rememberOsLastPlaceFromPath(
  pathname: string
): OsLastPlace | null {
  const place = osLastPlaceFromPathname(pathname);
  if (!place) return null;
  const current = readOsLastPlace();
  if (
    current &&
    accountIdsEqual(current.accountId, place.accountId) &&
    current.href === place.href
  ) {
    return current;
  }
  writeOsLastPlace(place);
  return place;
}

export function subscribeOsLastPlace(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — does not touch sessionStorage when memory-only. */
export function resetOsLastPlaceForTests(): void {
  memory = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  notify();
}
