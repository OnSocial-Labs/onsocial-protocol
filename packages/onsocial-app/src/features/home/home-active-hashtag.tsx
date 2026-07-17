'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { HomeFeedFocus } from '@/features/home/home-feed-focus';

const HomeActiveFocusContext = createContext<HomeFeedFocus | null>(null);

/** Supplies Home `?tag=` / `?ticker=` so post bodies can thicken matching tokens. */
export function HomeActiveFocusProvider({
  focus,
  children,
}: {
  focus: HomeFeedFocus | null;
  children: ReactNode;
}) {
  return (
    <HomeActiveFocusContext.Provider value={focus}>
      {children}
    </HomeActiveFocusContext.Provider>
  );
}

export function useHomeActiveFocus(): HomeFeedFocus | null {
  return useContext(HomeActiveFocusContext);
}

/** @deprecated Prefer {@link useHomeActiveFocus}. */
export function useHomeActiveHashtag(): string | null {
  const focus = useHomeActiveFocus();
  return focus?.kind === 'hashtag' ? focus.value : null;
}

/** @deprecated Prefer {@link HomeActiveFocusProvider}. */
export function HomeActiveHashtagProvider({
  tag,
  children,
}: {
  tag: string | null;
  children: ReactNode;
}) {
  return (
    <HomeActiveFocusProvider
      focus={tag ? { kind: 'hashtag', value: tag } : null}
    >
      {children}
    </HomeActiveFocusProvider>
  );
}
