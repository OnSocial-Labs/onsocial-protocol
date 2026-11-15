'use client';

import { useRef } from 'react';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsHeaderBack } from '@/components/app/os-header-back';
import { OsWriteDock } from '@/components/os/os-write-dock';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';
import { useSummonDockOccupiedHeight } from '@/hooks/use-summon-dock-occupied-height';
import { WRITE_DOCK_ADD_REPLY_PLACEHOLDER } from '@/lib/os-write-dock';

/**
 * Same reply bar the thread dock paints, held in the dock slot so the nav
 * pill never sits there. Not interactive — the page announces loading.
 */
function PostThreadReplyDockReserve() {
  const ref = useRef<HTMLDivElement>(null);
  useSummonDockOccupiedHeight(ref, true);
  return (
    <div
      ref={ref}
      className="portfolio-summon-dock is-writing is-reply-reserve"
      aria-hidden
    >
      <div className="os-dock-pill portfolio-summon is-writing">
        <OsDockAccountZone />
        <Divider
          orientation="vertical"
          variant="detail"
          className="portfolio-summon-divider"
        />
        <OsWriteDock
          placeholder={WRITE_DOCK_ADD_REPLY_PLACEHOLDER}
          ariaLabel="Reply"
          disabled
          onSubmit={() => false}
        />
      </div>
    </div>
  );
}

/** Route `loading.tsx` — same post chrome and thread skeleton as the page. */
export function PostThreadRouteLoading({ backHref }: { backHref: string }) {
  return (
    <OsAppScreen
      title="Post"
      glassChrome
      compactChrome
      backFallbackHref={backHref}
      leading={<OsHeaderBack fallbackHref={backHref} />}
      dock={<PostThreadReplyDockReserve />}
    >
      <div aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading post…</p>
        <PostThreadPageSkeleton />
      </div>
    </OsAppScreen>
  );
}
