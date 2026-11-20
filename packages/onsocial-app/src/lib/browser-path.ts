type Listener = () => void;

const listeners = new Set<Listener>();
let patched = false;
let lastHref = '';
let emitQueued = false;

/**
 * Notify after the current stack. Next App Router can call replaceState from
 * useInsertionEffect; sync useSyncExternalStore updates there are illegal.
 */
function flushListeners(): void {
  emitQueued = false;
  for (const listener of listeners) listener();
}

function emit(): void {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${window.location.search}`;
  if (next === lastHref) return;
  lastHref = next;
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(flushListeners);
}

function ensureHistoryPatch(): void {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  lastHref = `${window.location.pathname}${window.location.search}`;
  const { pushState, replaceState } = window.history;
  window.history.pushState = function patchedPushState(
    ...args: Parameters<History['pushState']>
  ) {
    const result = pushState.apply(this, args);
    emit();
    return result;
  };
  window.history.replaceState = function patchedReplaceState(
    ...args: Parameters<History['replaceState']>
  ) {
    const result = replaceState.apply(this, args);
    emit();
    return result;
  };
  window.addEventListener('popstate', emit);
}

/** Subscribe to `window.location` path+search (App Router push/replace/pop). */
export function subscribeBrowserPath(listener: Listener): () => void {
  ensureHistoryPatch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBrowserPath(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

export function getBrowserPathServerSnapshot(): string {
  return '';
}
