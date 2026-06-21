'use client';

import { useCallback, useRef, type RefObject, type WheelEventHandler } from 'react';

export function useFloatingPanelScroll<T extends HTMLElement = HTMLDivElement>(
  enabled = true
): {
  ref: RefObject<T | null>;
  onWheelCapture: WheelEventHandler<T>;
} {
  const ref = useRef<T>(null);

  const onWheelCapture = useCallback<WheelEventHandler<T>>((event) => {
    if (!enabled) {
      return;
    }

    const container = ref.current;
    if (!container || container.scrollHeight <= container.clientHeight) {
      return;
    }

    container.scrollTop += event.deltaY;
    event.preventDefault();
  }, [enabled]);

  return { ref, onWheelCapture };
}
