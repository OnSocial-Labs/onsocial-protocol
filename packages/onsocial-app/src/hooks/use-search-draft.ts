'use client';

import { useCallback, useEffect, useState } from 'react';

export const SEARCH_DRAFT_DEBOUNCE_MS = 200;

export type SearchDraftState = {
  /** Exact keystrokes. Spaces stay. */
  draft: string;
  /** Trimmed text for the list and the URL. */
  committed: string;
  /** Last trimmed text this field published. */
  written: string;
  focused: boolean;
  /** When the pending trimmed text should publish. Null while idle. */
  commitAt: number | null;
};

type SearchDraftAction =
  | { type: 'type'; value: string; now: number; debounceMs: number }
  | { type: 'flush'; now: number }
  | { type: 'focus' }
  | { type: 'blur'; external: string }
  | { type: 'external'; external: string; adopt: boolean }
  | { type: 'replace'; value: string };

export function initialSearchDraft(external = ''): SearchDraftState {
  const trimmed = external.trim();
  return {
    draft: external,
    committed: trimmed,
    written: trimmed,
    focused: false,
    commitAt: null,
  };
}

function adoptValue(
  state: SearchDraftState,
  value: string
): SearchDraftState {
  const trimmed = value.trim();
  if (
    state.draft === value &&
    state.committed === trimmed &&
    state.written === trimmed &&
    state.commitAt == null
  ) {
    return state;
  }
  return {
    ...state,
    draft: value,
    committed: trimmed,
    written: trimmed,
    commitAt: null,
  };
}

/** Field text stays exact. The list and the URL see a trimmed, debounced copy. */
export function reduceSearchDraft(
  state: SearchDraftState,
  action: SearchDraftAction
): SearchDraftState {
  switch (action.type) {
    case 'type': {
      const trimmed = action.value.trim();
      if (!trimmed) {
        if (
          state.draft === action.value &&
          state.committed === '' &&
          state.written === '' &&
          state.commitAt == null
        ) {
          return state;
        }
        return {
          ...state,
          draft: action.value,
          committed: '',
          written: '',
          commitAt: null,
        };
      }
      if (trimmed === state.written) {
        if (state.draft === action.value && state.commitAt == null) return state;
        return { ...state, draft: action.value, commitAt: null };
      }
      return {
        ...state,
        draft: action.value,
        commitAt: action.now + action.debounceMs,
      };
    }
    case 'flush': {
      if (state.commitAt == null || action.now < state.commitAt) return state;
      const trimmed = state.draft.trim();
      if (!trimmed) {
        return {
          ...state,
          committed: '',
          written: '',
          commitAt: null,
        };
      }
      return {
        ...state,
        committed: trimmed,
        written: trimmed,
        commitAt: null,
      };
    }
    case 'focus':
      return state.focused ? state : { ...state, focused: true };
    case 'blur': {
      const idle = { ...state, focused: false };
      if (state.draft.trim() !== state.written) return idle;
      if (action.external.trim() === state.written) return idle;
      return adoptValue(idle, action.external);
    }
    case 'external': {
      if (!action.adopt || state.focused) return state;
      const incoming = action.external.trim();
      if (incoming === state.written) return state;
      if (incoming === state.draft.trim()) {
        return state.written === incoming
          ? state
          : { ...state, written: incoming };
      }
      return adoptValue(state, action.external);
    }
    case 'replace':
      return adoptValue(state, action.value);
    default:
      return state;
  }
}

/**
 * Catalog search.
 * `draft` is what was typed. `committed` is trim()'d for filtering and the
 * address bar: it waits `debounceMs`, and clears immediately.
 * A URL echo of the last published text does not touch the field.
 * While the field is focused, outside URL updates wait.
 * `replace` applies Back / a shared link immediately.
 */
export function useSearchDraft(
  external = '',
  options?: { debounceMs?: number; adoptExternal?: boolean }
) {
  const debounceMs = options?.debounceMs ?? SEARCH_DRAFT_DEBOUNCE_MS;
  const adoptExternal = options?.adoptExternal ?? true;
  const [state, setState] = useState(() => initialSearchDraft(external));
  const [trackedExternal, setTrackedExternal] = useState(external);

  if (external !== trackedExternal) {
    setTrackedExternal(external);
    setState((current) =>
      reduceSearchDraft(current, {
        type: 'external',
        external,
        adopt: adoptExternal,
      })
    );
  }

  useEffect(() => {
    if (state.commitAt == null) return;
    const delay = Math.max(0, state.commitAt - Date.now());
    const id = window.setTimeout(() => {
      setState((current) =>
        reduceSearchDraft(current, { type: 'flush', now: Date.now() })
      );
    }, delay);
    return () => window.clearTimeout(id);
  }, [state.commitAt, state.draft]);

  const setDraft = useCallback(
    (value: string) => {
      setState((current) =>
        reduceSearchDraft(current, {
          type: 'type',
          value,
          now: Date.now(),
          debounceMs,
        })
      );
    },
    [debounceMs]
  );

  const onFocus = useCallback(() => {
    setState((current) => reduceSearchDraft(current, { type: 'focus' }));
  }, []);

  const onBlur = useCallback(() => {
    setState((current) =>
      reduceSearchDraft(current, {
        type: 'blur',
        external,
      })
    );
  }, [external]);

  const replace = useCallback((value: string) => {
    setState((current) =>
      reduceSearchDraft(current, { type: 'replace', value })
    );
  }, []);

  return {
    draft: state.draft,
    setDraft,
    committed: state.committed,
    onFocus,
    onBlur,
    replace,
  };
}
