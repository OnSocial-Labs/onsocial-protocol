import { Fragment, Suspense, isValidElement, type ReactNode } from 'react';
import { OVERLAY_INTERCEPT_ROOT } from '@/components/overlay/overlay-intercept-root';

export type OverlaySlotMode = 'idle' | 'intercept';

function matchesInterceptRoot(type: unknown): boolean {
  return (
    typeof type === 'function' &&
    (type as { overlayIntercept?: symbol }).overlayIntercept ===
      OVERLAY_INTERCEPT_ROOT
  );
}

function isOverlayDefaultComponent(type: unknown): boolean {
  if (typeof type !== 'function') {
    return false;
  }

  const named = type as { name?: string; displayName?: string };
  return (
    named.displayName === 'OverlayDefault' || named.name === 'OverlayDefault'
  );
}

function unwrapOverlayNode(overlay: ReactNode): ReactNode {
  if (!isValidElement(overlay)) {
    return overlay;
  }

  if (overlay.type === Fragment || overlay.type === Suspense) {
    return unwrapOverlayNode(
      (overlay.props as { children?: ReactNode }).children
    );
  }

  return overlay;
}

/** `@overlay/default.tsx` — parallel slot idle (portfolio page / hard refresh). */
export function isOverlayDefaultSlot(overlay: ReactNode): boolean {
  const node = unwrapOverlayNode(overlay);
  if (!isValidElement(node)) {
    return true;
  }

  if (matchesInterceptRoot(node.type)) {
    return false;
  }

  if (isOverlayDefaultComponent(node.type)) {
    return true;
  }

  return false;
}

export function resolveOverlaySlotMode(overlay: ReactNode): OverlaySlotMode {
  return isOverlayDefaultSlot(overlay) ? 'idle' : 'intercept';
}

/** Intercept overlay route rendered in the `@overlay` slot (soft nav). */
export function isOverlaySlotActive(overlay: ReactNode): boolean {
  return resolveOverlaySlotMode(overlay) === 'intercept';
}

/** True when the overlay root is {@link OverlayInterceptRoot}. */
export function isOverlayInterceptSlot(overlay: ReactNode): boolean {
  const node = unwrapOverlayNode(overlay);
  if (!isValidElement(node)) {
    return false;
  }

  return matchesInterceptRoot(node.type);
}
