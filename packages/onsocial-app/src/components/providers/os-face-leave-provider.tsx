'use client';

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  EMPTY_OS_FACE_LEAVE_STATE,
  peekOsFaceLeaveHref,
  reduceOsFaceLeaveConsume,
  reduceOsFaceLeaveHop,
  type OsFaceLeaveState,
} from '@/lib/os-face-leave';
import {
  loadOsFaceLeaveState,
  persistOsFaceLeaveState,
} from '@/lib/os-face-leave-store';
import {
  previousOsInAppHref,
  reduceOsInAppTrail,
} from '@/lib/os-in-app-trail';

export type OsFaceLeaveContextValue = {
  leaveHref: string;
  consumeLeave: () => string;
};

type OsFaceLeaveInternalValue = OsFaceLeaveContextValue & {
  trackHref: (href: string) => void;
  noteArrival: (href: string) => void;
  /** True once, and arms the face stack so the return is not a new origin. */
  beginPop: () => boolean;
  /** Screen under the current one in this tab. Null on a cold open. */
  previousInAppHref: () => string | null;
};

const FALLBACK_LEAVE: OsFaceLeaveContextValue = {
  leaveHref: APP_HOME_PATH,
  consumeLeave: () => APP_HOME_PATH,
};

const OsFaceLeaveContext = createContext<OsFaceLeaveInternalValue | null>(null);

function currentOsHref(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

/** Path hops live in layout so the dock is not one frame behind; consume is sync for router.push. */
export function OsFaceLeaveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OsFaceLeaveState>(
    EMPTY_OS_FACE_LEAVE_STATE
  );
  const stateRef = useRef(state);
  const sessionLoadedRef = useRef(false);
  const depthRef = useRef(0);
  const armedRef = useRef(false);
  const popPendingRef = useRef(false);
  const lastNotedRef = useRef<string | null>(null);
  const trailRef = useRef<string[]>([]);

  const trackHref = useCallback((href: string) => {
    const base = sessionLoadedRef.current
      ? stateRef.current
      : loadOsFaceLeaveState();
    sessionLoadedRef.current = true;
    const next = reduceOsFaceLeaveHop(base, href);
    stateRef.current = next;
    persistOsFaceLeaveState(next);
    setState(next);
  }, []);

  const noteArrival = useCallback((href: string) => {
    const popping = popPendingRef.current;
    if (lastNotedRef.current === href && !popping) return;
    if (!armedRef.current) {
      armedRef.current = true;
      lastNotedRef.current = href;
      depthRef.current = 1;
      trailRef.current = reduceOsInAppTrail([], href, false);
      return;
    }
    if (popping) {
      popPendingRef.current = false;
      lastNotedRef.current = href;
      depthRef.current = Math.max(1, depthRef.current - 1);
      trailRef.current = reduceOsInAppTrail(trailRef.current, href, true);
      return;
    }
    lastNotedRef.current = href;
    depthRef.current += 1;
    trailRef.current = reduceOsInAppTrail(trailRef.current, href, false);
  }, []);

  const previousInAppHref = useCallback(
    () => previousOsInAppHref(trailRef.current),
    []
  );

  const beginPop = useCallback(() => {
    if (depthRef.current <= 1) return false;
    popPendingRef.current = true;
    const next = { ...stateRef.current, popping: true };
    stateRef.current = next;
    persistOsFaceLeaveState(next);
    setState(next);
    return true;
  }, []);

  const consumeLeave = useCallback(() => {
    const next = reduceOsFaceLeaveConsume(stateRef.current);
    stateRef.current = next.state;
    persistOsFaceLeaveState(next.state);
    setState(next.state);
    return next.href;
  }, []);

  const value = useMemo<OsFaceLeaveInternalValue>(
    () => ({
      leaveHref: peekOsFaceLeaveHref(state),
      consumeLeave,
      trackHref,
      noteArrival,
      beginPop,
      previousInAppHref,
    }),
    [beginPop, consumeLeave, noteArrival, previousInAppHref, state, trackHref]
  );

  return (
    <OsFaceLeaveContext.Provider value={value}>
      <Suspense fallback={null}>
        <OsFaceLeavePathTracker />
      </Suspense>
      {children}
    </OsFaceLeaveContext.Provider>
  );
}

function OsFaceLeavePathTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const href = currentOsHref(pathname, searchParams.toString());
  const trackHref = useContext(OsFaceLeaveContext)?.trackHref;
  const noteArrival = useContext(OsFaceLeaveContext)?.noteArrival;

  useLayoutEffect(() => {
    trackHref?.(href);
    noteArrival?.(href);
  }, [href, noteArrival, trackHref]);

  return null;
}

/** Screen under the current one. Null when this tab opened here. */
export function useOsPreviousInAppHref(): () => string | null {
  const read = useContext(OsFaceLeaveContext)?.previousInAppHref;
  return useCallback(() => read?.() ?? null, [read]);
}

/** Pop one in-tab screen. False on a cold open, so the caller uses the parent. */
export function useOsInAppPop(): () => boolean {
  const router = useRouter();
  const beginPop = useContext(OsFaceLeaveContext)?.beginPop;

  return useCallback(() => {
    if (!beginPop?.()) return false;
    router.back();
    return true;
  }, [beginPop, router]);
}

export function useOsFaceLeave(): OsFaceLeaveContextValue {
  const value = useContext(OsFaceLeaveContext);
  if (!value) return FALLBACK_LEAVE;
  return { leaveHref: value.leaveHref, consumeLeave: value.consumeLeave };
}
