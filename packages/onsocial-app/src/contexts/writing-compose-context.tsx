'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type WritingComposeContextValue = {
  openPost: (() => void) | null;
  registerOpenPost: (fn: (() => void) | null) => void;
};

const WritingComposeContext = createContext<WritingComposeContextValue | null>(
  null
);

/**
 * Lets the Writing shelf open the expanded post sheet (title + align).
 * The owner composer registers from the face or a hard-refresh writing page.
 */
export function WritingComposeProvider({ children }: { children: ReactNode }) {
  const [openPost, setOpenPost] = useState<(() => void) | null>(null);
  const registerOpenPost = useCallback((fn: (() => void) | null) => {
    setOpenPost(() => fn);
  }, []);
  const value = useMemo<WritingComposeContextValue>(
    () => ({ openPost, registerOpenPost }),
    [openPost, registerOpenPost]
  );

  return (
    <WritingComposeContext.Provider value={value}>
      {children}
    </WritingComposeContext.Provider>
  );
}

export function useWritingComposeOpen(): (() => void) | null {
  return useContext(WritingComposeContext)?.openPost ?? null;
}

export function useRegisterWritingCompose(openPost: (() => void) | null) {
  const register = useContext(WritingComposeContext)?.registerOpenPost;

  useLayoutEffect(() => {
    if (!register) return;
    register(openPost);
    return () => register(null);
  }, [openPost, register]);
}
