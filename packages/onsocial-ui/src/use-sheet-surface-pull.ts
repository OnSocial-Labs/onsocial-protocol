'use client';

import { useEffect, type RefObject } from 'react';
import {
  collectVerticalScrollTops,
  elementOptsOutOfSheetPull,
  elementScrollsVertically,
  SHEET_PULL_CONFIRM_PX,
  sheetBodyPullDirection,
  sheetPressActivatesClick,
  sheetPullFromPanelBlocked,
  sheetPullPointerCanDrag,
  sheetPullTargetBlocks,
  sheetShouldBlockTextSelection,
  sheetShouldClaimFirstDownwardMove,
  sheetTouchMovePreventsNativePan,
} from './sheet-body-pull.js';

export type SheetSurfacePullApi = {
  keyboardOpen: boolean;
  beginPointerDrag: (
    startY: number,
    capture: { setPointerCapture?: (pointerId: number) => void } | null,
    pointerId: number
  ) => void;
  handlePointerMove: (event: { clientY: number }) => void;
  handlePointerEnd: () => void;
};

type ClickSwallowTarget = {
  addEventListener: (
    type: string,
    listener: (event: Event) => void,
    capture?: boolean
  ) => void;
  removeEventListener: (
    type: string,
    listener: (event: Event) => void,
    capture?: boolean
  ) => void;
};

/**
 * Swallow the click this pull already queued. The guard drops on the next
 * turn so the following press is not blocked.
 */
export function armSheetPullClickSwallow(
  target: ClickSwallowTarget,
  schedule: (release: () => void) => void = (release) => {
    setTimeout(release, 0);
  }
): void {
  let stop: ((event: Event) => void) | null = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    release();
  };
  const release = () => {
    if (!stop) return;
    target.removeEventListener('click', stop, true);
    target.removeEventListener('auxclick', stop, true);
    stop = null;
  };
  target.addEventListener('click', stop, true);
  target.addEventListener('auxclick', stop, true);
  schedule(release);
}

/**
 * Downward pull from anywhere on a dismissable sheet, once every scroller
 * under the finger is at the top. The grip keeps its own handler.
 * Touch and pen only. A short or slow press remains a click until a pull
 * is confirmed.
 */
export function useSheetSurfacePull(input: {
  enabled: boolean;
  panel: HTMLElement | null;
  scrollBody: HTMLElement | null;
  apiRef: RefObject<SheetSurfacePullApi>;
  gripSelector?: string;
}): void {
  const {
    enabled,
    panel,
    scrollBody,
    apiRef,
    gripSelector = '.glass-sheet-drag',
  } = input;

  useEffect(() => {
    if (!enabled || !panel) return;
    const body = scrollBody;

    const releasePullClass = () => {
      panel.classList.remove('is-body-pull');
    };

    const sheetBodyTop = () =>
      body && elementScrollsVertically(body) ? body.scrollTop : null;

    const blocked = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !panel.contains(target)) return true;
      if (elementOptsOutOfSheetPull(target)) return true;
      return sheetPullFromPanelBlocked({
        keyboardOpen: apiRef.current.keyboardOpen,
        inField: sheetPullTargetBlocks(target),
        onGrip: Boolean(target.closest(gripSelector)),
        ancestorTops: collectVerticalScrollTops(target, panel),
        sheetBodyTop: sheetBodyTop(),
      });
    };

    let armingPull = false;
    let pull: {
      pointerId: number;
      startX: number;
      startY: number;
      phase: 'pending' | 'pull' | 'abort';
      claimedDownwardMove: boolean;
    } | null = null;

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!sheetPullPointerCanDrag(event.pointerType)) return;
      if (blocked(event.target)) return;
      pull = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        phase: 'pending',
        claimedDownwardMove: false,
      };
    };

    const keepContentFromGrabbing = (event: Event) => {
      if (!sheetShouldBlockTextSelection(pull?.phase ?? null)) return;
      event.preventDefault();
    };

    const onMove = (event: PointerEvent) => {
      if (!pull || event.pointerId !== pull.pointerId) return;
      if (apiRef.current.keyboardOpen) {
        const pulling = pull.phase === 'pull';
        pull = null;
        releasePullClass();
        if (pulling) apiRef.current.handlePointerEnd();
        return;
      }
      if (
        pull.phase === 'pending' &&
        !pull.claimedDownwardMove &&
        event.cancelable &&
        sheetShouldClaimFirstDownwardMove({
          phase: pull.phase,
          dx: event.clientX - pull.startX,
          dy: event.clientY - pull.startY,
          alreadyClaimed: false,
        }) &&
        !blocked(event.target)
      ) {
        event.preventDefault();
        pull.claimedDownwardMove = true;
      }
      if (pull.phase === 'pending') {
        const direction = sheetBodyPullDirection(
          event.clientX - pull.startX,
          event.clientY - pull.startY,
          SHEET_PULL_CONFIRM_PX
        );
        if (direction === 'pending') return;
        if (direction === 'abort' || blocked(event.target)) {
          pull.phase = 'abort';
          return;
        }
        pull.phase = 'pull';
        panel.classList.add('is-body-pull');
        window.getSelection?.()?.removeAllRanges();
        armingPull = true;
        try {
          apiRef.current.beginPointerDrag(pull.startY, panel, event.pointerId);
        } finally {
          armingPull = false;
        }
      }
      if (pull.phase !== 'pull') return;
      if (sheetTouchMovePreventsNativePan(pull.phase) && event.cancelable) {
        event.preventDefault();
      }
      apiRef.current.handlePointerMove(event);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pull) return;
      if (sheetTouchMovePreventsNativePan(pull.phase)) {
        if (event.cancelable) event.preventDefault();
        return;
      }
      const touch = event.touches[0];
      if (!touch || pull.phase !== 'pending') return;
      if (
        !sheetShouldClaimFirstDownwardMove({
          phase: pull.phase,
          dx: touch.clientX - pull.startX,
          dy: touch.clientY - pull.startY,
          alreadyClaimed: pull.claimedDownwardMove,
        })
      ) {
        return;
      }
      if (blocked(event.target)) return;
      if (!event.cancelable) return;
      event.preventDefault();
      pull.claimedDownwardMove = true;
    };

    const onUp = (event: PointerEvent) => {
      if (armingPull) return;
      if (!pull || event.pointerId !== pull.pointerId) return;
      const finished = pull;
      pull = null;
      releasePullClass();
      if (!sheetPressActivatesClick({ phase: finished.phase })) {
        armSheetPullClickSwallow(window);
      }
      if (finished.phase === 'pull') apiRef.current.handlePointerEnd();
    };

    panel.addEventListener('pointerdown', onDown, true);
    panel.addEventListener('selectstart', keepContentFromGrabbing, true);
    panel.addEventListener('dragstart', keepContentFromGrabbing, true);
    panel.addEventListener('pointermove', onMove, {
      capture: true,
      passive: false,
    });
    panel.addEventListener('pointerup', onUp, true);
    panel.addEventListener('pointercancel', onUp, true);
    panel.addEventListener('touchmove', onTouchMove, {
      capture: true,
      passive: false,
    });
    return () => {
      panel.removeEventListener('pointerdown', onDown, true);
      panel.removeEventListener('selectstart', keepContentFromGrabbing, true);
      panel.removeEventListener('dragstart', keepContentFromGrabbing, true);
      panel.removeEventListener('pointermove', onMove, true);
      panel.removeEventListener('pointerup', onUp, true);
      panel.removeEventListener('pointercancel', onUp, true);
      panel.removeEventListener('touchmove', onTouchMove, true);
      pull = null;
      releasePullClass();
    };
  }, [apiRef, enabled, gripSelector, panel, scrollBody]);
}
