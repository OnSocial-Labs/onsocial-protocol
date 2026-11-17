import { expect, type Page } from '@playwright/test';

type SheetBodyFrame = {
  header: boolean;
  opacity: number;
  routeSkeleton: boolean;
  /** PostThreadPageSkeleton focal block, including the dynamic chunk fallback. */
  pageSkeleton: boolean;
  root: boolean;
  kind: 'route-skeleton' | 'page-skeleton' | 'root' | 'empty';
};

/**
 * Same order as the blank-frame log:
 * route cover, then PostThreadPageSkeleton, then a visible root, else empty.
 */
function sheetBodyKind(frame: {
  opacity: number;
  routeSkeleton: boolean;
  pageSkeleton: boolean;
  root: boolean;
}): SheetBodyFrame['kind'] {
  if (frame.routeSkeleton) return 'route-skeleton';
  if (frame.pageSkeleton) return 'page-skeleton';
  if (frame.root && frame.opacity > 0.9) return 'root';
  return 'empty';
}

/** Sample the open sheet from the click until the appear window has passed. */
export async function armSheetBodyFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as Window & { __sheetBodyFrames?: SheetBodyFrame[] };
    target.__sheetBodyFrames = [];
    const start = performance.now();
    const tick = () => {
      const sheet = document.querySelector('.post-thread-sheet-panel');
      const title = sheet?.querySelector('.os-app-screen-title');
      const body = sheet?.querySelector('.os-page-body-appear');
      target.__sheetBodyFrames?.push({
        header: Boolean(title && (title.textContent ?? '').includes('Post')),
        opacity: body ? Number(getComputedStyle(body).opacity) : 0,
        routeSkeleton: Boolean(sheet?.querySelector('.os-route-skeleton')),
        pageSkeleton: Boolean(
          sheet?.querySelector('.post-card--skeleton.post-card--detail')
        ),
        root: Boolean(sheet?.querySelector('.guild-thread-root')),
        kind: 'empty',
      });
      if (performance.now() - start < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** After the header is up, every frame has the root or a skeleton. */
export async function expectSheetBodyNeverEmpty(page: Page): Promise<void> {
  await page.waitForTimeout(1000);
  const frames = await page.evaluate(() => {
    return (
      (window as Window & { __sheetBodyFrames?: SheetBodyFrame[] })
        .__sheetBodyFrames ?? []
    );
  });
  const shown = frames
    .filter((frame) => frame.header)
    .map((frame) => ({ ...frame, kind: sheetBodyKind(frame) }));
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.filter((frame) => frame.kind === 'empty')).toEqual([]);
}
