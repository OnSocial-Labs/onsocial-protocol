'use client';

import { useEffect, type RefObject } from 'react';
import {
  collectVerticalScrollTops,
  elementScrollsVertically,
  sheetBodyPullDirection,
  sheetPressActivatesClick,
  sheetPullFromPanelBlocked,
  sheetPullTargetBlocks,
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

/**
 * Downward pull from anywhere on a dismissable sheet, once every scroller
 * under the finger is at the top. The grip keeps its own handler.
 * A short still press remains a click. A drag or a long hold does not.
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
      return sheetPullFromPanelBlocked({
        keyboardOpen: apiRef.current.keyboardOpen,
        inField: sheetPullTargetBlocks(target),
        onGrip: Boolean(target.closest(gripSelector)),
        ancestorTops: collectVerticalScrollTops(target, panel),
        sheetBodyTop: sheetBodyTop(),
      });
    };

    let armingPull = false;
    let clickStop: ((event: Event) => void) | null = null;
    let clickTimer = 0;
    let pull: {
      pointerId: number;
      startX: number;
      startY: number;
      startedAt: number;
      phase: 'pending' | 'pull' | 'abort';
    } | null = null;

    const releaseClickStop = () => {
      if (clickTimer) {
        window.clearTimeout(clickTimer);
        clickTimer = 0;
      }
      if (!clickStop) return;
      window.removeEventListener('click', clickStop, true);
      window.removeEventListener('auxclick', clickStop, true);
      clickStop = null;
    };

    const swallowNextClick = () => {
      releaseClickStop();
      clickStop = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        releaseClickStop();
      };
      window.addEventListener('click', clickStop, true);
      window.addEventListener('auxclick', clickStop, true);
      clickTimer = window.setTimeout(releaseClickStop, 700);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (blocked(event.target)) return;
      panel.classList.add('is-body-pull');
      pull = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
        phase: 'pending',
      };
    };

    const keepContentFromGrabbing = (event: Event) => {
      if (!pull) return;
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
      if (pull.phase === 'pending') {
        const direction = sheetBodyPullDirection(
          event.clientX - pull.startX,
          event.clientY - pull.startY
        );
        if (direction === 'pending') return;
        if (direction === 'abort' || blocked(event.target)) {
          pull.phase = 'abort';
          return;
        }
        pull.phase = 'pull';
        window.getSelection?.()?.removeAllRanges();
        armingPull = true;
        try {
          apiRef.current.beginPointerDrag(pull.startY, panel, event.pointerId);
        } finally {
          armingPull = false;
        }
      }
      if (pull.phase === 'abort') return;
      if (event.cancelable) event.preventDefault();
      apiRef.current.handlePointerMove(event);
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!pull || !touch || pull.phase === 'abort') return;
      const dy = touch.clientY - pull.startY;
      const dx = touch.clientX - pull.startX;
      if (dy <= 0 || dy < Math.abs(dx)) return;
      if (event.cancelable) event.preventDefault();
    };

    const onUp = (event: PointerEvent) => {
      if (armingPull) return;
      if (!pull || event.pointerId !== pull.pointerId) return;
      const finished = pull;
      pull = null;
      releasePullClass();
      const movedPx = Math.hypot(
        event.clientX - finished.startX,
        event.clientY - finished.startY
      );
      if (
        !sheetPressActivatesClick({
          phase: finished.phase,
          heldMs: performance.now() - finished.startedAt,
          movedPx,
        })
      ) {
        swallowNextClick();
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
      releaseClickStop();
      pull = null;
      releasePullClass();
    };
  }, [apiRef, enabled, gripSelector, panel, scrollBody]);
}
