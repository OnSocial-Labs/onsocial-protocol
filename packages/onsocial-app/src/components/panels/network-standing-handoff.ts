import { accountIdFromPath, parseOverlayPanelKey } from '@/lib/overlay-routes';

const HANDOFF_TTL_MS = 10_000;

export type StandingHandoffPhase = 'open' | 'close';

type PendingStandingList = {
  phase: StandingHandoffPhase;
  accountId: string;
  href: string;
  displayName: string;
  avatarUrl: string | null;
  at: number;
  pushed: boolean;
};

let pending: PendingStandingList | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function live(now: number): PendingStandingList | null {
  if (!pending) return null;
  if (now - pending.at > HANDOFF_TTL_MS) return null;
  return pending;
}

export function subscribeNetworkStandingHandoff(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNetworkStandingHandoffPhase(
  now = Date.now()
): StandingHandoffPhase | null {
  return live(now)?.phase ?? null;
}

export function getNetworkStandingHandoffFace(now = Date.now()): {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
} | null {
  const current = live(now);
  if (!current || current.phase !== 'open') return null;
  return {
    accountId: current.accountId,
    displayName: current.displayName,
    avatarUrl: current.avatarUrl,
  };
}

/** Open handoff, including the list href, even after the portfolio push. */
export function getNetworkStandingHandoffOpenTarget(now = Date.now()): {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  href: string;
} | null {
  const current = live(now);
  if (!current || current.phase !== 'open') return null;
  return {
    accountId: current.accountId,
    displayName: current.displayName,
    avatarUrl: current.avatarUrl,
    href: current.href,
  };
}

/**
 * Face taps leave Next on the first map. Opening that person's standing
 * from the map reuses the map as the page under the sheet. Remember the
 * list, move onto their portfolio, then open the sheet there.
 */
export function armNetworkStandingHandoff(
  input: {
    accountId: string;
    href: string;
    displayName?: string;
    avatarUrl?: string | null;
  },
  now = Date.now()
) {
  pending = {
    phase: 'open',
    accountId: input.accountId,
    href: input.href,
    displayName: input.displayName?.trim() || '',
    avatarUrl: input.avatarUrl ?? null,
    at: now,
    pushed: false,
  };
  emit();
}

/** Holds the map hidden while Standing close replaces onto the portfolio. */
export function armStandingCloseCover(accountId: string, now = Date.now()) {
  pending = {
    phase: 'close',
    accountId,
    href: '',
    displayName: '',
    avatarUrl: null,
    at: now,
    pushed: true,
  };
  emit();
}

export function peekNetworkStandingHandoff(
  accountId: string,
  now = Date.now()
): string | null {
  const current = live(now);
  if (!current || current.phase !== 'open' || current.pushed) return null;
  if (current.accountId !== accountId) return null;
  return current.href;
}

export function takeNetworkStandingHandoff(
  accountId: string,
  now = Date.now()
): string | null {
  const href = peekNetworkStandingHandoff(accountId, now);
  if (!href || !pending) return null;
  pending = { ...pending, pushed: true };
  emit();
  return href;
}

export function clearNetworkStandingHandoff() {
  if (!pending) return;
  pending = null;
  emit();
}

/** The opening sheet already covered the map, so a later remount must not fade again. */
let standingSheetCovered = false;

export function markStandingSheetCovered() {
  standingSheetCovered = true;
}

export function standingSheetAlreadyCovered(): boolean {
  return standingSheetCovered;
}

export function clearStandingSheetCovered() {
  standingSheetCovered = false;
}

const NETWORK_FRAME_HOLD_ID = 'standing-handoff-hold';
const COVERED_FEED_SCREEN = '[data-feed-session="covered"]';

/**
 * The parked Home feed is also an `.os-app-screen`, and it stays first in the
 * document. Freezing that node paints the feed under Standing and leaves the
 * next profile unable to take a click.
 */
export function pickLiveOsAppScreen<
  T extends { closest(selector: string): unknown },
>(screens: ArrayLike<T>): T | null {
  for (let index = screens.length - 1; index >= 0; index -= 1) {
    const screen = screens[index];
    if (!screen) continue;
    if (screen.closest(COVERED_FEED_SCREEN)) continue;
    if (screen.closest(`#${NETWORK_FRAME_HOLD_ID}`)) continue;
    return screen;
  }
  return null;
}

/**
 * Keep the handoff up only on the subject it was armed for, or on the map
 * that started it before the portfolio replace lands. Any other route — the
 * home feed, another profile — must drop it so that face can be clicked.
 */
export function networkStandingHandoffBlocksFace(
  pathname: string,
  now = Date.now()
): boolean {
  const current = live(now);
  if (!current) return false;
  if (accountIdFromPath(pathname) === current.accountId) return true;
  return (
    !current.pushed &&
    current.phase === 'open' &&
    parseOverlayPanelKey(pathname) === 'network'
  );
}

/** Keep the map on screen while the route moves under an opening standing sheet. */
export function holdNetworkStandingFrame() {
  if (typeof document === 'undefined') return;
  document.getElementById(NETWORK_FRAME_HOLD_ID)?.remove();
  const screen = pickLiveOsAppScreen(
    document.querySelectorAll<HTMLElement>('.os-app-screen')
  );
  if (!(screen instanceof HTMLElement)) return;
  const hold = document.createElement('div');
  hold.id = NETWORK_FRAME_HOLD_ID;
  const clone = screen.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return;
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  // A cloned node restarts `network-orbit-fade-in` (fill backwards, from
  // opacity 0). Freeze motion so the held map stays at the frame we copied.
  freezeCloneMotion(clone);
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute('inert', '');
  hold.appendChild(clone);
  document.body.appendChild(hold);
}

function freezeCloneMotion(root: HTMLElement) {
  const nodes: HTMLElement[] = [root];
  root.querySelectorAll<HTMLElement>('*').forEach((node) => {
    nodes.push(node);
  });
  for (const node of nodes) {
    node.style.setProperty('animation', 'none');
    node.style.setProperty('transition', 'none');
  }
}

export function releaseNetworkStandingFrame() {
  if (typeof document === 'undefined') return;
  document.getElementById(NETWORK_FRAME_HOLD_ID)?.remove();
}

export type StandingOpeningFace = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Viewer is this subject, so the sheet says You from the first paint. */
  subjectIsViewer: boolean;
};

let openingFace: StandingOpeningFace | null = null;

/** Name already on the map, so the standing sheet can open with it. */
export function rememberStandingOpeningFace(
  face: Omit<StandingOpeningFace, 'subjectIsViewer'> & {
    subjectIsViewer?: boolean;
  }
) {
  openingFace = {
    accountId: face.accountId,
    displayName: face.displayName.trim(),
    avatarUrl: face.avatarUrl,
    subjectIsViewer: face.subjectIsViewer === true,
  };
}

export function getStandingOpeningFace(
  accountId: string
): StandingOpeningFace | null {
  if (!openingFace || openingFace.accountId !== accountId) return null;
  return openingFace;
}

export function isStandingHandoffPortfolioFace(
  pathname: string,
  accountId: string
): boolean {
  return (
    accountIdFromPath(pathname) === accountId &&
    parseOverlayPanelKey(pathname) == null
  );
}
