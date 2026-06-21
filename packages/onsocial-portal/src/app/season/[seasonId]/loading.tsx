import { SeasonPageLoadingShell } from '@/features/season/season-page-loading-shell';

/** Route loading UI — `loading.tsx` does not receive `params` (Next.js convention). */
export default function Loading() {
  return <SeasonPageLoadingShell />;
}
