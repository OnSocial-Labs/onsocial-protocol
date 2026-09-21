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
import { usePathname, useSearchParams } from 'next/navigation';
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

export type OsFaceLeaveContextValue = {
  leaveHref: string;
  consumeLeave: () => string;
};

type OsFaceLeaveInternalValue = OsFaceLeaveContextValue & {
  trackHref: (href: string) => void;
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
    }),
    [consumeLeave, state, trackHref]
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

  useLayoutEffect(() => {
    trackHref?.(href);
  }, [href, trackHref]);

  return null;
}

export function useOsFaceLeave(): OsFaceLeaveContextValue {
  const value = useContext(OsFaceLeaveContext);
  if (!value) return FALLBACK_LEAVE;
  return { leaveHref: value.leaveHref, consumeLeave: value.consumeLeave };
}
