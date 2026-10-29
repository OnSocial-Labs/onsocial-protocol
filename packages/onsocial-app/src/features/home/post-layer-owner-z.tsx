'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** Rendered z of the post layer that owns this tree. Null on the feed. */
const PostLayerOwnerZContext = createContext<number | null>(null);

export function PostLayerOwnerZProvider({
  value,
  children,
}: {
  value: number;
  children: ReactNode;
}) {
  return (
    <PostLayerOwnerZContext.Provider value={value}>
      {children}
    </PostLayerOwnerZContext.Provider>
  );
}

export function usePostLayerOwnerZ(): number | null {
  return useContext(PostLayerOwnerZContext);
}
