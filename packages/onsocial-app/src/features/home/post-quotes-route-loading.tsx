'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  PostQuotesPageSkeleton,
  PostQuotesTrackSkeleton,
} from '@/features/home/post-quotes-skeleton';
import { POST_REACH_TITLE } from '@/lib/post-reach-title';

/** Route `loading.tsx` — same Post reach chrome and list skeleton as the page. */
export function PostQuotesRouteLoading({
  backHref,
  activeTab = 'quotes',
}: {
  backHref: string;
  activeTab?: 'quotes' | 'reposts';
}) {
  return (
    <OsAppScreen
      title={POST_REACH_TITLE}
      compactChrome
      dockBack
      glassChrome
      nestedScrollChrome
      className="post-quotes-screen-chrome"
      toolbar={<PostQuotesTrackSkeleton activeTab={activeTab} />}
      backFallbackHref={backHref}
    >
      <div aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading post reach…</p>
        <PostQuotesPageSkeleton />
      </div>
    </OsAppScreen>
  );
}
