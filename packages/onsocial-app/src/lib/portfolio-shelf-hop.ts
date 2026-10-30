/**
 * Home opens Writing by landing on the profile face, then continuing to the
 * shelf. The open reader stays mounted underneath. A writing sheet covers it
 * on the tap, and the face stays hidden until that sheet is up.
 */

import { isWritingShelfPath } from '@/lib/overlay-routes';

export type PortfolioShelfHopFace = {
  accountId: string;
  titleLabel: string;
  avatarUrl: string | null;
};

type PortfolioShelfHopSnapshot = {
  active: boolean;
  arrived: boolean;
  covered: boolean;
  holdAccountId: string | null;
  face: PortfolioShelfHopFace | null;
};

const SERVER_SNAPSHOT: PortfolioShelfHopSnapshot = {
  active: false,
  arrived: false,
  covered: false,
  holdAccountId: null,
  face: null,
};

const STYLE_ID = 'portfolio-shelf-hop';

/** Unlayered so it wins over the portfolio canvas in `@layer components`. */
const HOP_CSS = `
html[data-shelf-hop] .portfolio-frame {
  background: transparent !important;
}
html[data-shelf-hop] .portfolio-frame > .portfolio-page {
  visibility: hidden !important;
}
`;

let active = false;
let leftHome = false;
let arrived = false;
let covered = false;
let holdAccountId: string | null = null;
let face: PortfolioShelfHopFace | null = null;
let snapshot: PortfolioShelfHopSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit() {
  snapshot = {
    active,
    arrived,
    covered,
    holdAccountId,
    face,
  };
  listeners.forEach((listener) => listener());
}

function paintDocument() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(STYLE_ID);
  if (active) {
    document.documentElement.dataset.shelfHop = '';
    if (!existing) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = HOP_CSS;
      document.head.appendChild(style);
    }
    return;
  }
  delete document.documentElement.dataset.shelfHop;
  existing?.remove();
}

export function beginPortfolioShelfHop(next?: PortfolioShelfHopFace | null) {
  active = true;
  leftHome = false;
  arrived = false;
  covered = true;
  if (next?.accountId) {
    face = {
      accountId: next.accountId,
      titleLabel: next.titleLabel.trim() || next.accountId,
      avatarUrl: next.avatarUrl,
    };
    holdAccountId = next.accountId;
  }
  paintDocument();
  emit();
}

export function endPortfolioShelfHop() {
  if (!active) return;
  active = false;
  leftHome = false;
  arrived = false;
  face = null;
  paintDocument();
  emit();
}

/** Real Writing sheet is in the DOM. The opening sheet can leave. */
export function markWritingShelfArrived() {
  if (!active || arrived) return;
  arrived = true;
  emit();
}

/** Glass host should replace the opening sheet instead of fading a second one. */
export function writingShelfAlreadyCovered() {
  return covered;
}

export function getPortfolioShelfHopSnapshot() {
  return snapshot;
}

export function getPortfolioShelfHopServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/**
 * Keep the feed tree that still has the reader open. A fresh feed would
 * show the list in the gap, and again when Writing closes.
 */
export function shouldRetainOpenedFeed(input: {
  onFeed: boolean;
  shelfHop: boolean;
  holdAccountId: string | null;
  pathname: string | null;
}): boolean {
  if (input.onFeed) return false;
  if (input.shelfHop) return true;
  if (!input.holdAccountId) return false;
  return isWritingShelfPath(input.holdAccountId, input.pathname);
}

/** Drop the held reader once Writing is no longer the screen we hopped to. */
export function releaseWritingShelfHold() {
  if (!holdAccountId && !covered && !face) return;
  holdAccountId = null;
  covered = false;
  face = null;
  emit();
}

export function markShelfHopLeftHome() {
  if (active) leftHome = true;
}

export function hasShelfHopLeftHome() {
  return leftHome;
}

export function isPortfolioShelfHop() {
  return active;
}

export function subscribePortfolioShelfHop(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
