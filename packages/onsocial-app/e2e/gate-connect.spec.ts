import { devices, expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

test.describe('signed-out gate connect', () => {
  test('shows a dock pill labelled Let’s connect, with no glyph', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/');
    await dismissNextDevOverlay(page);

    const button = page.locator('.gate .gate-connect-button');
    await expect(button).toBeVisible({ timeout: 15_000 });
    await expect(button).toHaveClass(/os-dock-pill/);
    await expect(button).toHaveText('Let’s connect');
    await expect(page.locator('.gate .app-wallet-connect-glyph')).toHaveCount(
      0
    );

    const box = await button.boundingBox();
    const railBox = await page.locator('.gate-dapp-rail').boundingBox();
    if (!box || !railBox) {
      throw new Error('gate connect or rail has no box');
    }
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeGreaterThanOrEqual(railBox.y + railBox.height + 16);

    for (let i = 0; i < 24; i += 1) {
      if (await button.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(button).toBeFocused();
  });
});

type FillReport = {
  backgroundColor: string;
  want: string;
  backgroundImage: string;
  backdrop: string;
  beforeContent: string;
  beforeBackdrop: string;
  borderWidths: string[];
  borderColors: string[];
  actionBorder: string;
};

function phoneUse(device: (typeof devices)['iPhone 13']) {
  return {
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  };
}

async function installClsObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
        };
        if (!shift.hadRecentInput) cls += shift.value ?? 0;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    Object.defineProperty(window, '__gateCls', {
      configurable: true,
      get: () => cls,
    });
  });
}

async function gateCls(page: Page): Promise<number> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  return page.evaluate(() =>
    Number((window as { __gateCls?: number }).__gateCls ?? 0)
  );
}

async function revealInstall(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(
      new Event('beforeinstallprompt', { cancelable: true })
    );
  });
  await expect(
    page.locator(
      '.gate-install-slot .os-sheet-action:not(.gate-install-reserve)'
    )
  ).toBeVisible();
}

async function expectRailClearsActions(page: Page): Promise<void> {
  const rail = page.locator('.gate .gate-dapp-rail');
  const stack = page.locator('.gate .gate-connect');
  await expect(rail).toBeVisible();
  await expect(stack).toBeVisible();
  const railBox = await rail.boundingBox();
  const stackBox = await stack.boundingBox();
  if (!railBox || !stackBox) {
    throw new Error('gate rail or actions have no box');
  }
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(stackBox.y + 0.5);
}

async function readFill(
  page: Page,
  selector: string,
  token: string
): Promise<FillReport> {
  return page.evaluate(
    ({ selector, token }) => {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) {
        throw new Error(`missing ${selector}`);
      }
      const probe = document.createElement('div');
      probe.style.backgroundColor = `var(${token})`;
      const border = document.createElement('div');
      border.style.borderTop = '1px solid var(--os-action-border)';
      document.body.append(probe, border);
      const want = getComputedStyle(probe).backgroundColor;
      const actionBorder = getComputedStyle(border).borderTopColor;
      probe.remove();
      border.remove();
      const cs = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      return {
        backgroundColor: cs.backgroundColor,
        want,
        backgroundImage: cs.backgroundImage,
        backdrop: cs.backdropFilter,
        beforeContent: before.content,
        beforeBackdrop: before.backdropFilter,
        borderWidths: [
          cs.borderTopWidth,
          cs.borderRightWidth,
          cs.borderBottomWidth,
          cs.borderLeftWidth,
        ],
        borderColors: [
          cs.borderTopColor,
          cs.borderRightColor,
          cs.borderBottomColor,
          cs.borderLeftColor,
        ],
        actionBorder,
      };
    },
    { selector, token }
  );
}

function expectTokenFill(report: FillReport, bordered: boolean): void {
  expect(report.backgroundColor).toBe(report.want);
  expect(report.backgroundImage).toBe('none');
  expect(report.backdrop === 'none' || report.backdrop === '').toBe(true);
  const pseudoPaints =
    report.beforeContent !== 'none' && report.beforeContent !== 'normal';
  if (pseudoPaints) {
    expect(
      report.beforeBackdrop === 'none' || report.beforeBackdrop === ''
    ).toBe(true);
  }
  if (!bordered) {
    expect(pseudoPaints).toBe(false);
    for (const width of report.borderWidths) expect(width).toBe('0px');
    return;
  }
  const [top, right, bottom, left] = report.borderColors;
  expect(top).toBe(report.actionBorder);
  expect(right).toBe(top);
  expect(bottom).toBe(top);
  expect(left).toBe(top);
  expect(new Set(report.borderWidths).size).toBe(1);
}

async function settlePaint(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const iterations = animation.effect?.getTiming().iterations;
      if (iterations === Infinity) continue;
      try {
        animation.finish();
      } catch {
        /* A fill that cannot finish still settles on its own. */
      }
    }
  });
}

async function expectGateFills(page: Page): Promise<void> {
  await settlePaint(page);
  expectTokenFill(
    await readFill(
      page,
      '.gate .os-dock-pill.gate-connect-button',
      '--os-surface-fill-strong'
    ),
    false
  );
  const install = page.locator(
    '.gate-install-slot .os-sheet-action:not(.gate-install-reserve)'
  );
  if ((await install.count()) === 0) return;
  expectTokenFill(
    await readFill(
      page,
      '.gate-install-slot .os-sheet-action.os-sheet-action--ghost:not(.gate-install-reserve)',
      '--os-surface-fill-quiet'
    ),
    true
  );
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate((next) => {
    document.documentElement.setAttribute('data-theme', next);
  }, theme);
}

async function expectStableInstallSlot(
  page: Page,
  ios: boolean
): Promise<void> {
  await expect(page.locator('.gate-install-slot')).toBeVisible();
  const slot = await page.locator('.gate-install-slot').boundingBox();
  if (ios) {
    await expect(page.locator('.gate-connect-install-hint')).toBeVisible();
  } else {
    await revealInstall(page);
  }
  const slotAfter = await page.locator('.gate-install-slot').boundingBox();
  if (!slot || !slotAfter) throw new Error('install slot has no box');
  expect(Math.abs(slot.height - slotAfter.height)).toBeLessThan(1);
  expect(Math.abs(slot.y - slotAfter.y)).toBeLessThan(1);
  expect(await gateCls(page)).toBe(0);
  await expectRailClearsActions(page);
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    await expectRailClearsActions(page);
    await expectGateFills(page);
  }
}

test.describe('desktop gate', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('reserves the install slot with CLS 0 and token fills', async ({
    page,
  }) => {
    await installClsObserver(page);
    await gotoApp(page, '/');
    await dismissNextDevOverlay(page);
    await expectStableInstallSlot(page, false);
  });
});

for (const name of ['iPhone 13', 'Pixel 7'] as const) {
  const device = devices[name];

  test.describe(`${name} gate`, () => {
    test.use(phoneUse(device));

    test('reserves the install slot with CLS 0 and token fills', async ({
      page,
    }) => {
      await installClsObserver(page);
      await gotoApp(page, '/');
      await dismissNextDevOverlay(page);
      await expectStableInstallSlot(page, name === 'iPhone 13');
    });

    test('portrait, landscape, and portrait keep the rail clear of the buttons', async ({
      page,
    }) => {
      const portrait = {
        width: device.viewport.width,
        height: device.viewport.height,
      };
      const landscape = {
        width: device.viewport.height,
        height: device.viewport.width,
      };
      await gotoApp(page, '/');
      await dismissNextDevOverlay(page);
      await revealInstall(page);

      for (const size of [portrait, landscape, portrait]) {
        await page.setViewportSize(size);
        await expectRailClearsActions(page);
        await expectGateFills(page);
        for (const theme of ['dark', 'light'] as const) {
          await setTheme(page, theme);
          await expectRailClearsActions(page);
          await expectGateFills(page);
        }
      }
    });
  });
}
