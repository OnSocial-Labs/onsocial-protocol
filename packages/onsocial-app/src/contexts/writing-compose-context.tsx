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

export type OpenPersonalComposeOptions = {
  /** Open already flipped to Article (Writing shelf). */
  article?: boolean;
};

export type OpenPersonalCompose = (
  opts?: OpenPersonalComposeOptions
) => void;

type WritingComposeContextValue = {
  openPost: OpenPersonalCompose | null;
  registerOpenPost: (fn: OpenPersonalCompose | null) => void;
};

const WritingComposeContext = createContext<WritingComposeContextValue | null>(
  null
);

/**
 * Lets the Writing shelf open compose in Article mode (title required).
 * The owner composer registers from the face or a hard-refresh writing page.
 */
export function WritingComposeProvider({ children }: { children: ReactNode }) {
  const [openPost, setOpenPost] = useState<OpenPersonalCompose | null>(null);
  const registerOpenPost = useCallback((fn: OpenPersonalCompose | null) => {
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

export function useWritingComposeOpen(): OpenPersonalCompose | null {
  return useContext(WritingComposeContext)?.openPost ?? null;
}

export function useRegisterWritingCompose(
  openPost: OpenPersonalCompose | null
) {
  const register = useContext(WritingComposeContext)?.registerOpenPost;

  useLayoutEffect(() => {
    if (!register) return;
    register(openPost);
    return () => register(null);
  }, [openPost, register]);
}
