'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  popComposeStack,
  topComposeStack,
  upsertComposeStack,
} from '@/lib/compose-launcher-stack';

type ComposeAction = () => void;

/** What the dock action button creates — picks the glyph (pen / stars / mint). */
export type ComposeKind = 'post' | 'drop' | 'mint' | 'propose';

export interface ComposeLauncherEntry {
  action: ComposeAction;
  kind: ComposeKind;
}

export interface WriteDockSubmit {
  text: string;
  files: File[];
}

export interface WriteDockRegistration {
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  error?: string | null;
  above?: ReactNode;
  accept?: string;
  /** Extra key so chips (reply-to) refresh without remounting the stack. */
  revision?: string;
  onSubmit: (
    payload: WriteDockSubmit
  ) => boolean | void | Promise<boolean | void>;
}

type ComposeStackItem =
  | { id: string; type: 'action'; entry: ComposeLauncherEntry }
  | { id: string; type: 'write'; entry: WriteDockRegistration };

export type ComposeLauncherSurface =
  | { type: 'action'; entry: ComposeLauncherEntry }
  | { type: 'write'; entry: WriteDockRegistration };

interface ComposeLauncherContextValue {
  surface: ComposeLauncherSurface | null;
  writePinned: boolean;
  upsertCompose: (item: ComposeStackItem) => void;
  popCompose: (id: string) => void;
  focusWriteDock: () => void;
  registerWriteFocus: (fn: () => void) => () => void;
  setWritePinned: (pinned: boolean) => void;
}

const ComposeLauncherContext =
  createContext<ComposeLauncherContextValue | null>(null);

export function ComposeLauncherProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<ComposeStackItem[]>([]);
  const [writePinned, setWritePinned] = useState(false);
  const writeFocusRef = useRef<(() => void) | null>(null);

  const upsertCompose = useCallback((item: ComposeStackItem) => {
    setStack((current) => upsertComposeStack(current, item));
  }, []);

  const popCompose = useCallback((id: string) => {
    setStack((current) => popComposeStack(current, id));
  }, []);

  const registerWriteFocus = useCallback((fn: () => void) => {
    writeFocusRef.current = fn;
    return () => {
      if (writeFocusRef.current === fn) writeFocusRef.current = null;
    };
  }, []);

  const focusWriteDock = useCallback(() => {
    writeFocusRef.current?.();
  }, []);

  const surface = useMemo<ComposeLauncherSurface | null>(() => {
    const top = topComposeStack(stack);
    if (!top) return null;
    return top.type === 'write'
      ? { type: 'write', entry: top.entry }
      : { type: 'action', entry: top.entry };
  }, [stack]);

  const writing = surface?.type === 'write';

  const value = useMemo<ComposeLauncherContextValue>(
    () => ({
      surface,
      writePinned: writing && writePinned,
      upsertCompose,
      popCompose,
      focusWriteDock,
      registerWriteFocus,
      setWritePinned,
    }),
    [
      focusWriteDock,
      popCompose,
      registerWriteFocus,
      surface,
      upsertCompose,
      writePinned,
      writing,
    ]
  );

  return (
    <ComposeLauncherContext.Provider value={value}>
      {children}
    </ComposeLauncherContext.Provider>
  );
}

export function useComposeLauncher(): ComposeLauncherSurface | null {
  return useContext(ComposeLauncherContext)?.surface ?? null;
}

export function useWriteDockPinned(): boolean {
  return useContext(ComposeLauncherContext)?.writePinned ?? false;
}

export function useFocusWriteDock(): () => void {
  return (
    useContext(ComposeLauncherContext)?.focusWriteDock ?? (() => undefined)
  );
}

export function useWriteDockChrome() {
  const context = useContext(ComposeLauncherContext);
  return {
    registerWriteFocus: context?.registerWriteFocus,
    setWritePinned: context?.setWritePinned,
  };
}

/**
 * Register the dock action while the calling surface is mounted.
 * Pass null when the viewer cannot compose here (button stays hidden).
 * `kind` picks the glyph: pen for posts (default), purple stars for drops,
 * green stars for mint, pen for propose.
 */
export function useRegisterComposeAction(
  action: ComposeAction | null,
  kind: ComposeKind = 'post'
) {
  const context = useContext(ComposeLauncherContext);
  const upsertCompose = context?.upsertCompose;
  const popCompose = context?.popCompose;
  const id = useId();

  useEffect(() => {
    if (!upsertCompose || !popCompose || !action) return;
    upsertCompose({ id, type: 'action', entry: { action, kind } });
    return () => popCompose(id);
  }, [action, id, kind, popCompose, upsertCompose]);
}

/** Morph the dock action into the compact write bar. */
export function useRegisterWriteDock(entry: WriteDockRegistration | null) {
  const context = useContext(ComposeLauncherContext);
  const upsertCompose = context?.upsertCompose;
  const popCompose = context?.popCompose;
  const id = useId();
  const entryRef = useRef(entry);
  const key = entry
    ? [
        entry.placeholder,
        entry.ariaLabel ?? '',
        entry.disabled ? '1' : '0',
        entry.pending ? '1' : '0',
        entry.error ?? '',
        entry.accept ?? '',
        entry.revision ?? '',
        Boolean(entry.above) ? '1' : '0',
      ].join('\0')
    : '';

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useEffect(() => {
    if (!upsertCompose || !popCompose || !entryRef.current) return;
    const current = entryRef.current;
    upsertCompose({
      id,
      type: 'write',
      entry: {
        ...current,
        onSubmit: (payload) => entryRef.current?.onSubmit(payload),
      },
    });
    return () => popCompose(id);
  }, [id, key, popCompose, upsertCompose]);
}
