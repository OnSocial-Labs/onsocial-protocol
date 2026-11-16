'use client';

import { GUILDS_PAGE_CLASS } from '@/lib/os-chrome-page';
import { PostRowSkeleton } from '@/features/home/post-skeleton';

/** Inert Quotes / Reposts track — same toolbar seat as the ready screen. */
export function PostQuotesTrackSkeleton({
  activeTab = 'quotes',
}: {
  activeTab?: 'quotes' | 'reposts';
} = {}) {
  return (
    <div
      className="app-storage-mode-toggle post-quotes-track"
      role="tablist"
      aria-label="Quotes and reposts"
      aria-hidden
      inert
    >
      <span
        className={`app-storage-mode os-disabled-ink${activeTab === 'quotes' ? ' is-active' : ''}`}
      >
        Quotes
      </span>
      <span
        className={`app-storage-mode os-disabled-ink${activeTab === 'reposts' ? ' is-active' : ''}`}
      >
        Reposts
      </span>
    </div>
  );
}

/** Full-page body — quote rows under Post reach chrome. */
export function PostQuotesPageSkeleton({ rows = 4 }: { rows?: number } = {}) {
  return (
    <div className={`${GUILDS_PAGE_CLASS} post-quotes-screen`} aria-hidden>
      <PostRowSkeleton rows={rows} />
    </div>
  );
}
