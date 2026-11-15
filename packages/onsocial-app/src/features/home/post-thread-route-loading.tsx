'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsHeaderBack } from '@/components/app/os-header-back';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';

/** Route `loading.tsx` — same post chrome and thread skeleton as the page. */
export function PostThreadRouteLoading({ backHref }: { backHref: string }) {
  return (
    <OsAppScreen
      title="Post"
      glassChrome
      compactChrome
      backFallbackHref={backHref}
      leading={<OsHeaderBack fallbackHref={backHref} />}
    >
      <div aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading post…</p>
        <PostThreadPageSkeleton />
      </div>
    </OsAppScreen>
  );
}
