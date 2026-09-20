'use client';

import { useSyncExternalStore } from 'react';
import { essayReturnSearch } from '@/lib/essay-return-href';

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('popstate', onStoreChange);
  return () => window.removeEventListener('popstate', onStoreChange);
}

function readClientSearch(): string {
  return essayReturnSearch(window.location.search);
}

/** Empty on the server so the shelf HTML matches hydrate. */
export function useEssayReturnSearch(): string {
  return useSyncExternalStore(subscribe, readClientSearch, () => '');
}
