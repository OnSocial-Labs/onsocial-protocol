import { expect, type Page } from '@playwright/test';

type SheetBodyFrame = {
  header: boolean;
  opacity: number;
  routeSkeleton: boolean;
  focalSkeleton: boolean;
  root: boolean;
};

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
        focalSkeleton: Boolean(
          sheet?.querySelector('.post-card--skeleton.post-card--detail')
        ),
        root: Boolean(sheet?.querySelector('.guild-thread-root')),
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
  const shown = frames.filter((frame) => frame.header);
  expect(shown.length).toBeGreaterThan(0);
  const empty = shown.filter(
    (frame) =>
      !frame.routeSkeleton &&
      !frame.focalSkeleton &&
      !(frame.root && frame.opacity > 0.9)
  );
  expect(empty).toEqual([]);
}
