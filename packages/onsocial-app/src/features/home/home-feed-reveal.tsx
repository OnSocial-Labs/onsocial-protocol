import type { PropsWithChildren, ReactNode } from 'react';

/**
 * One slot for the home list. The element type does not change when the
 * skeleton gives way to posts, and a shown list is not put back under a cover.
 * Hard loads pass `showSkeleton={false}` with the server children already final.
 */
export function HomeFeedReveal({
  showSkeleton,
  skeleton,
  children,
}: PropsWithChildren<{
  showSkeleton: boolean;
  skeleton: ReactNode;
}>) {
  return (
    <div className="home-feed-reveal">
      {showSkeleton ? (
        skeleton
      ) : (
        <div className="home-feed-reveal-body">{children}</div>
      )}
    </div>
  );
}
