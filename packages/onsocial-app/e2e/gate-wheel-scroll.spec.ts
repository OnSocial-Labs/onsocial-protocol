import { mkdir, writeFile } from 'node:fs/promises';
import { devices, expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

const ARTIFACTS = '/opt/cursor/artifacts/gate-wheel';

test.use({ video: 'on' });

function phoneUse(device: (typeof devices)['iPhone 13']) {
  return {
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  };
}

type Box = { x: number; y: number; width: number; height: number };

function sameBox(a: Box, b: Box): void {
  expect(Math.abs(a.x - b.x)).toBeLessThan(1);
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  expect(Math.abs(a.height - b.height)).toBeLessThan(1);
}

async function readChrome(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    };
    const list = document.querySelector('.gate .gate-dapp-list');
    return {
      logo: box('.gate-logo'),
      connect: box('.gate .gate-connect-button'),
      rail: box('.gate .gate-dapp-rail'),
      stack: box('.gate .gate-connect'),
      scrollY: window.scrollY,
      gateScroll: document.querySelector('.gate-scroll')?.scrollTop ?? 0,
      listScroll: list instanceof HTMLElement ? list.scrollTop : 0,
    };
  });
}

async function touchFling(
  page: Page,
  capture: boolean,
  dir: string,
  anchor: Awaited<ReturnType<typeof readChrome>> | null
): Promise<void> {
  const list = page.locator('.gate .gate-dapp-list');
  const box = await list.boundingBox();
  if (!box) throw new Error('wheel has no box');
  const x = box.x + box.width / 2;
  const startY = box.y + box.height * 0.72;
  const endY = box.y + box.height * 0.28;
  const session = await page.context().newCDPSession(page);
  const steps = 8;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY, id: 1 }],
  });
  for (let i = 1; i <= steps; i += 1) {
    const y = startY + ((endY - startY) * i) / steps;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, id: 1 }],
    });
    if (anchor?.logo && anchor.connect) {
      const sample = await readChrome(page);
      if (!sample.logo || !sample.connect || !sample.rail || !sample.stack) {
        throw new Error('gate chrome left the screen during the fling');
      }
      sameBox(anchor.logo, sample.logo);
      sameBox(anchor.connect, sample.connect);
      expect(sample.scrollY).toBe(0);
      expect(sample.gateScroll).toBe(0);
      expect(sample.rail.y + sample.rail.height).toBeLessThanOrEqual(
        sample.stack.y + 0.5
      );
    }
    if (capture) {
      await page.screenshot({
        path: `${dir}/frame-${String(i).padStart(2, '0')}.png`,
      });
    }
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  if (capture) {
    await page.screenshot({ path: `${dir}/frame-09.png` });
  }
  await page.waitForFunction(() => {
    const scroller = document.querySelector('.gate .gate-dapp-list');
    if (!(scroller instanceof HTMLElement)) return false;
    const marked = scroller as HTMLElement & { __gateSettle?: number };
    const previous = marked.__gateSettle;
    const next = scroller.scrollTop;
    marked.__gateSettle = next;
    return previous === next && next > 0;
  });
}

async function measureFling(page: Page): Promise<{
  p95: number;
  longTasks: number[];
}> {
  await page.evaluate(() => {
    const w = window as Window & {
      __gateFrames?: number[];
      __gateLong?: number[];
    };
    w.__gateFrames = [];
    w.__gateLong = [];
    let last = performance.now();
    const tick = (now: number) => {
      w.__gateFrames?.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          w.__gateLong?.push(entry.duration);
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* longtask is optional in this browser */
    }
  });
  await touchFling(page, false, '', null);
  return page.evaluate(() => {
    const w = window as Window & {
      __gateFrames?: number[];
      __gateLong?: number[];
    };
    const samples = (w.__gateFrames ?? [])
      .filter((ms) => ms > 0)
      .sort((a, b) => a - b);
    const p95 = samples.length
      ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))]
      : 0;
    return { p95, longTasks: w.__gateLong ?? [] };
  });
}

for (const name of ['iPhone 13', 'Pixel 7'] as const) {
  const device = devices[name];
  const slug = name.toLowerCase().replace(' ', '-');

  test.describe(`${name} gate wheel`, () => {
    test.use(phoneUse(device));

    for (const orientation of ['portrait', 'landscape'] as const) {
      test(`drag and fling keeps the logo and connect still (${orientation})`, async ({
        page,
      }) => {
        const portrait = {
          width: device.viewport.width,
          height: device.viewport.height,
        };
        const size =
          orientation === 'portrait'
            ? portrait
            : { width: portrait.height, height: portrait.width };
        await page.setViewportSize(size);
        await gotoApp(page, '/');
        await dismissNextDevOverlay(page);
        await expect(page.locator('.gate .gate-dapp-list')).toBeVisible();

        const before = await readChrome(page);
        if (!before.logo || !before.connect || !before.rail || !before.stack) {
          throw new Error('gate chrome has no box');
        }
        expect(before.rail.y + before.rail.height).toBeLessThanOrEqual(
          before.stack.y + 0.5
        );

        const dir = `${ARTIFACTS}/${slug}-${orientation}`;
        await mkdir(dir, { recursive: true });
        const timing = await measureFling(page);
        await page.evaluate(() => {
          const scroller = document.querySelector('.gate .gate-dapp-list');
          if (scroller instanceof HTMLElement) {
            scroller.scrollTop = 0;
            delete (scroller as HTMLElement & { __gateSettle?: number })
              .__gateSettle;
          }
        });
        await touchFling(page, false, '', before);
        const row = await page.evaluate(() => {
          const item = document.querySelector('.gate .gate-dapp-item');
          return item instanceof HTMLElement
            ? item.getBoundingClientRect().height
            : 44;
        });
        for (let i = 0; i < 8; i += 1) {
          await page.evaluate((top) => {
            const scroller = document.querySelector('.gate .gate-dapp-list');
            if (scroller instanceof HTMLElement) scroller.scrollTop = top;
          }, row * i);
          await page.screenshot({
            path: `${dir}/frame-${String(i + 1).padStart(2, '0')}.png`,
          });
        }

        const during = await readChrome(page);
        if (!during.logo || !during.connect || !during.rail || !during.stack) {
          throw new Error('gate chrome moved off screen');
        }
        sameBox(before.logo, during.logo);
        sameBox(before.connect, during.connect);
        expect(during.scrollY).toBe(0);
        expect(during.gateScroll).toBe(0);
        expect(during.rail.y + during.rail.height).toBeLessThanOrEqual(
          during.stack.y + 0.5
        );
        expect(during.listScroll).toBeGreaterThan(0);

        const snapped = await page.evaluate(() => {
          const list = document.querySelector('.gate .gate-dapp-list');
          const row = list?.querySelector('.gate-dapp-item');
          if (!(list instanceof HTMLElement) || !(row instanceof HTMLElement)) {
            return null;
          }
          const rowHeight = row.getBoundingClientRect().height;
          const remainder = list.scrollTop % rowHeight;
          const distance = Math.min(remainder, rowHeight - remainder);
          const current = list.querySelector('[aria-current="true"]');
          return {
            distance,
            rowHeight,
            hasCurrent: current instanceof HTMLElement,
          };
        });
        expect(snapped).not.toBeNull();
        expect(snapped!.distance).toBeLessThan(2);
        expect(snapped!.hasCurrent).toBe(true);

        await writeFile(
          `${dir}/frames.json`,
          JSON.stringify(
            { p95: timing.p95, longTasks: timing.longTasks },
            null,
            2
          )
        );
        expect(timing.p95).toBeLessThan(50);
      });
    }
  });
}
