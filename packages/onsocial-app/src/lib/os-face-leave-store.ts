import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  EMPTY_OS_FACE_LEAVE_STATE,
  peekOsFaceLeaveHref,
  reduceOsFaceLeaveConsume,
  reduceOsFaceLeaveHop,
  type OsFaceLeaveState,
} from '@/lib/os-face-leave';

const STACK_KEY = 'onsocial.os.face-leave-stack';
const LAST_KEY = 'onsocial.os.face-leave-last';

let state: OsFaceLeaveState = loadState();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function loadState(): OsFaceLeaveState {
  if (typeof sessionStorage === 'undefined') {
    return { ...EMPTY_OS_FACE_LEAVE_STATE };
  }
  try {
    const lastHref = sessionStorage.getItem(LAST_KEY);
    const rawStack = sessionStorage.getItem(STACK_KEY);
    const stack = rawStack ? (JSON.parse(rawStack) as unknown) : [];
    return {
      lastHref: lastHref && lastHref.startsWith('/') ? lastHref : null,
      stack: Array.isArray(stack)
        ? stack.filter((href): href is string => typeof href === 'string')
        : [],
      popping: false,
    };
  } catch {
    return { ...EMPTY_OS_FACE_LEAVE_STATE };
  }
}

function persist(next: OsFaceLeaveState): void {
  state = next;
  emit();
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (next.lastHref) sessionStorage.setItem(LAST_KEY, next.lastHref);
    else sessionStorage.removeItem(LAST_KEY);
    sessionStorage.setItem(STACK_KEY, JSON.stringify(next.stack));
  } catch {
    /* private mode */
  }
}

export function subscribeOsFaceLeave(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readOsFaceLeaveHref(): string {
  return peekOsFaceLeaveHref(state);
}

export function applyOsFaceLeaveHop(href: string): void {
  persist(reduceOsFaceLeaveHop(state, href));
}

/** Dock Back — parent origin, else Home. Marks the hop as a leave so we do not re-push. */
export function consumeOsFaceLeaveHref(): string {
  const next = reduceOsFaceLeaveConsume(state);
  persist(next.state);
  return next.href;
}

export function clearOsFaceLeaveForTests(): void {
  persist({ ...EMPTY_OS_FACE_LEAVE_STATE });
}

export function readOsFaceLeaveStateForTests(): OsFaceLeaveState {
  return state;
}

export { APP_HOME_PATH };
