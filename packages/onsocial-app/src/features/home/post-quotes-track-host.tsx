'use client';

import { createContext, useContext } from 'react';

/** Header slot for the Quotes / Reposts track. Null until the sheet mounts it. */
const PostQuotesTrackHostContext = createContext<HTMLElement | null>(null);

export const PostQuotesTrackHostProvider = PostQuotesTrackHostContext.Provider;

export function usePostQuotesTrackHost(): HTMLElement | null {
  return useContext(PostQuotesTrackHostContext);
}
