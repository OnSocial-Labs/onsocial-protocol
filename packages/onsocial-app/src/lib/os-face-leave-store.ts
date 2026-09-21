import {
  EMPTY_OS_FACE_LEAVE_STATE,
  type OsFaceLeaveState,
} from '@/lib/os-face-leave';

const STACK_KEY = 'onsocial.os.face-leave-stack';
const LAST_KEY = 'onsocial.os.face-leave-last';

export function loadOsFaceLeaveState(): OsFaceLeaveState {
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

export function persistOsFaceLeaveState(next: OsFaceLeaveState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (next.lastHref) sessionStorage.setItem(LAST_KEY, next.lastHref);
    else sessionStorage.removeItem(LAST_KEY);
    sessionStorage.setItem(STACK_KEY, JSON.stringify(next.stack));
  } catch {
    /* private mode */
  }
}

export function clearOsFaceLeaveStorageForTests(): void {
  persistOsFaceLeaveState({ ...EMPTY_OS_FACE_LEAVE_STATE });
}
