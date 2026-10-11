'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useOsInAppPop } from '@/components/providers/os-face-leave-provider';
import {
  accountIdFromPath,
  parseOverlayPanelKey,
  portfolioPath,
} from '@/lib/overlay-routes';

/**
 * Standing close leaves to that person's portfolio. A history pop lands on
 * the network map, because face taps are their own history entries.
 */
export function standingCloseLeavesToFace(pathname: string): boolean {
  return parseOverlayPanelKey(pathname)?.startsWith('standing:') ?? false;
}

/** Portfolio account Standing closes onto — the person in the address. */
export function standingCloseAccountId(
  pathname: string,
  layoutAccountId: string
): string | null {
  if (!standingCloseLeavesToFace(pathname)) return null;
  return accountIdFromPath(pathname) ?? layoutAccountId;
}

/** Standing opened on the map should close onto the portfolio without revealing it. */
export function standingCloseSkipsReveal(
  pathname: string,
  layoutSegments: readonly string[]
): boolean {
  if (!standingCloseLeavesToFace(pathname)) return false;
  return layoutSegments.some((segment) => segment === 'network');
}

function standingPathToClose(
  nextPathname: string,
  browserPathname: string
): string | null {
  if (standingCloseLeavesToFace(browserPathname)) return browserPathname;
  if (standingCloseLeavesToFace(nextPathname)) return nextPathname;
  return null;
}

/**
 * A globe click (or any in-sheet link) already left for the map.
 * The sheet's leftover close must not replace that with the profile.
 */
export function overlayDismissShouldReplace(
  browserPathname: string,
  nextPathname: string
): boolean {
  const browserKey = parseOverlayPanelKey(browserPathname);
  const nextKey = parseOverlayPanelKey(nextPathname);
  if (browserKey === 'network' || nextKey === 'network') return false;
  return true;
}

/**
 * Dismiss a portfolio overlay drawer.
 * Pop when this sheet was opened in the tab, so the face underneath is the
 * same history entry the person was opened on. Replacing the sheet URL with
 * the face leaves that face in history twice, and the next Back stays put.
 * If the pop does not leave the overlay (no entry underneath), replace onto
 * the face — a leftover `/standing/...` URL with the sheet gone blocks the
 * next signal tap. In-sheet view switches still use `replace`.
 * Standing always replaces onto the face.
 */
export function useOverlayClose(accountId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const popInApp = useOsInAppPop();

  return useCallback(() => {
    const browserPathname = window.location.pathname;
    if (!overlayDismissShouldReplace(browserPathname, pathname)) return;
    const standingPath = standingPathToClose(pathname, browserPathname);
    const standingAccountId = standingPath
      ? standingCloseAccountId(standingPath, accountId)
      : null;
    if (standingAccountId) {
      router.replace(portfolioPath(standingAccountId), { scroll: false });
      return;
    }
    const face = portfolioPath(accountId);
    const before = window.location.pathname;
    if (!popInApp()) {
      router.replace(face, { scroll: false });
      return;
    }
    const timer = window.setTimeout(() => {
      if (window.location.pathname === before) {
        router.replace(face, { scroll: false });
      }
    }, 400);
    window.addEventListener(
      'popstate',
      () => {
        window.clearTimeout(timer);
      },
      { once: true }
    );
  }, [accountId, pathname, popInApp, router]);
}
