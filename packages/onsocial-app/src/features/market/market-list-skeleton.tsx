'use client';

import { useLayoutEffect, useRef } from 'react';
import { writeDropsDebugLog } from '@/lib/drops-debug-log';

interface MarketListSkeletonProps {
  rows?: number;
  variant?: 'market' | 'drops';
}

/** Shimmer placeholders for Market listing / sales rows. */
export function MarketListSkeleton({
  rows = 5,
  variant = 'market',
}: MarketListSkeletonProps) {
  const isDrops = variant === 'drops';
  const listRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!isDrops) return;
    const list = listRef.current;
    const screen = list?.closest<HTMLElement>('.os-app-screen');
    const body = list?.closest<HTMLElement>('.os-app-screen-body');
    const header = screen?.querySelector<HTMLElement>('.os-app-screen-header');
    if (!list || !screen || !body || !header) return;
    const listRect = list.getBoundingClientRect();
    const screenRect = screen.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const rowHeights = Array.from(
      list.querySelectorAll<HTMLElement>(':scope > .market-listing-row')
    ).map((row) => row.getBoundingClientRect().height);
    // #region agent log
    writeDropsDebugLog('C', 'drops skeleton layout after commit', {
      phase: 'layout-effect',
      shell: Boolean(header.querySelector('[data-drops-loading]'))
        ? 'route-loading'
        : 'client-panel',
      rows,
      listTop: listRect.top,
      listHeight: listRect.height,
      rowHeights,
      bodyTop: bodyRect.top,
      bodyHeight: bodyRect.height,
      screenHeight: screenRect.height,
      headerHeight: header.offsetHeight,
      chromeVar: screen.style.getPropertyValue('--os-screen-chrome-height'),
      bodyPaddingTop: getComputedStyle(body).paddingTop,
      fonts: document.fonts.status,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    // #endregion
  }, [isDrops, rows]);

  return (
    <div
      ref={listRef}
      className="market-listing-list market-listing-list--skeleton"
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={`market-listing-row market-listing-row--skeleton${
            isDrops ? ' drops-discovery-row' : ''
          }`}
        >
          <span
            className={`standing-row-shimmer market-listing-thumb-shimmer${
              isDrops ? ' drops-discovery-thumb' : ''
            }`}
          />
          <div
            className={`market-listing-copy${
              isDrops ? ' drops-discovery-copy' : ''
            }`}
          >
            <div
              className={`market-listing-head${
                isDrops ? ' drops-discovery-head' : ''
              }`}
            >
              <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-title" />
            </div>
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-identity" />
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-meta" />
          </div>
          <div
            className={`market-listing-action-col${
              isDrops ? ' drops-discovery-action-col' : ''
            }`}
          >
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-time" />
            <span className="standing-row-shimmer market-listing-shimmer-action" />
          </div>
        </div>
      ))}
    </div>
  );
}
