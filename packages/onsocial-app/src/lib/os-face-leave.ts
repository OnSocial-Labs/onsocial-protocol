import { accountIdsEqual } from '@/lib/account-match';
import { APP_HOME_PATH } from '@/lib/app-routes';

/** In-tab stack of places that opened a face. Deep links still leave Home. */
export const OS_FACE_LEAVE_STACK_MAX = 8;

export type OsFaceLeaveState = {
  lastHref: string | null;
  stack: string[];
  popping: boolean;
};

export const EMPTY_OS_FACE_LEAVE_STATE: OsFaceLeaveState = {
  lastHref: null,
  stack: [],
  popping: false,
};

/** Same-app path + query only. Never the gate. */
export function normalizeOsLeaveHref(
  href: string | null | undefined
): string | null {
  const raw = (href ?? '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  const noHash = raw.split('#')[0] ?? '';
  if (!noHash.startsWith('/') || noHash.startsWith('//')) return null;
  if (noHash === '/') return null;
  if (noHash === '/api' || noHash.startsWith('/api/')) return null;
  const [path, query] = noHash.split('?');
  if (!path || path === '/') return null;
  return query ? `${path}?${query}` : path;
}

export function portfolioAccountFromHref(
  href: string | null | undefined
): string | null {
  const normalized = normalizeOsLeaveHref(href);
  if (!normalized) return null;
  const pathname = normalized.split('?')[0] ?? '';
  const match = pathname.match(/^\/@([^/]+)/);
  if (!match?.[1]) return null;
  try {
    const accountId = decodeURIComponent(match[1]).trim();
    return accountId || null;
  } catch {
    return null;
  }
}

export function peekOsFaceLeaveHref(state: OsFaceLeaveState): string {
  const top = state.stack[state.stack.length - 1];
  return normalizeOsLeaveHref(top) ?? APP_HOME_PATH;
}

export function reduceOsFaceLeaveConsume(state: OsFaceLeaveState): {
  href: string;
  state: OsFaceLeaveState;
} {
  if (state.stack.length === 0) {
    return {
      href: APP_HOME_PATH,
      state: { ...state, popping: true },
    };
  }
  const href = peekOsFaceLeaveHref(state);
  return {
    href,
    state: {
      lastHref: state.lastHref,
      stack: state.stack.slice(0, -1),
      popping: true,
    },
  };
}

export function reduceOsFaceLeaveHop(
  state: OsFaceLeaveState,
  rawHref: string
): OsFaceLeaveState {
  const current = normalizeOsLeaveHref(rawHref);
  if (!current) return state;
  if (current === state.lastHref && !state.popping) return state;

  const currentAccount = portfolioAccountFromHref(current);

  if (state.popping) {
    return {
      lastHref: current,
      stack: currentAccount ? state.stack : [],
      popping: false,
    };
  }

  if (!currentAccount) {
    return { lastHref: current, stack: [], popping: false };
  }

  const prev = state.lastHref;
  const prevAccount = portfolioAccountFromHref(prev);
  const sameFace =
    Boolean(prevAccount && currentAccount) &&
    accountIdsEqual(prevAccount!, currentAccount);
  if (prev && prev !== current && !sameFace) {
    const origin = normalizeOsLeaveHref(prev);
    if (origin) {
      const stack = [...state.stack.filter((href) => href !== origin), origin];
      return {
        lastHref: current,
        stack: stack.slice(-OS_FACE_LEAVE_STACK_MAX),
        popping: false,
      };
    }
  }

  return { lastHref: current, stack: state.stack, popping: false };
}
