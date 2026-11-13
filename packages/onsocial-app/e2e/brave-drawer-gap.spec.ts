import { expect, test, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  gotoApp,
} from './helpers';
import { stubShorterVisualViewport } from './helpers/visual-viewport';

const PHONES = [
  { name: 'iPhone', width: 390, height: 844 },
  { name: 'Samsung', width: 360, height: 780 },
  { name: 'Pixel', width: 412, height: 915 },
] as const;

type DrawerMeasure = {
  keyboardOpen: boolean;
  hosted: boolean;
  toolbar: string;
  dockVar: string;
  panelVsDock: number;
  panelVsVisual: number;
  restingFooter: string;
  sheetFooter: string;
  rootBottomCss: string;
  inlineBottom: string;
  inlinePaddingBottom: string;
  nonHostedBottom: string;
  nonHostedPaddingBottom: string;
};

async function openPageDrawer(
  page: Page,
  viewport: { width: number; height: number }
): Promise<void> {
  await page.setViewportSize(viewport);
  await gotoApp(page, '/@alice.testnet');
  await dismissNextDevOverlay(page);
  const open = page.getByRole('button', { name: 'Open page', exact: true });
  await expect(open).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  await open.click();
  await page.waitForFunction(
    () => {
      const panel = document.querySelector(
        '.glass-sheet-panel.page-drawer-panel'
      );
      if (!(panel instanceof HTMLElement)) return false;
      const transform = getComputedStyle(panel).transform;
      return (
        panel.classList.contains('is-open') &&
        (transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)')
      );
    },
    undefined,
    { timeout: E2E_CHROME_TIMEOUT_MS }
  );
}

async function measureDrawer(page: Page): Promise<DrawerMeasure> {
  return page.evaluate(() => {
    const panel = document.querySelector(
      '.glass-sheet-panel.page-drawer-panel'
    );
    const dock = document.querySelector('.portfolio-summon-dock');
    const root =
      panel instanceof HTMLElement ? panel.closest('.glass-sheet-root') : null;
    if (
      !(panel instanceof HTMLElement) ||
      !(root instanceof HTMLElement) ||
      !(dock instanceof HTMLElement)
    ) {
      throw new Error('missing page drawer');
    }
    const vv = window.visualViewport;
    const visualBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const panelBox = panel.getBoundingClientRect();
    const dockBox = dock.getBoundingClientRect();
    const rootStyle = getComputedStyle(root);
    const htmlStyle = getComputedStyle(document.documentElement);

    const outside = document.createElement('div');
    outside.className = 'os-sheet-footer';
    outside.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none';
    document.body.appendChild(outside);
    const restingFooter = getComputedStyle(outside).paddingBottom;
    const inside = document.createElement('div');
    inside.className = 'os-sheet-footer';
    inside.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none';
    panel.appendChild(inside);
    const sheetFooter = getComputedStyle(inside).paddingBottom;
    outside.remove();
    inside.remove();

    const bare = document.createElement('div');
    bare.className = 'glass-sheet-root';
    bare.style.cssText = 'visibility:hidden;pointer-events:none';
    document.body.appendChild(bare);
    const bareStyle = getComputedStyle(bare);
    const nonHostedBottom = bareStyle.bottom;
    const nonHostedPaddingBottom = bareStyle.paddingBottom;
    bare.remove();

    return {
      keyboardOpen: panel.classList.contains('is-keyboard-open'),
      hosted: root.classList.contains('glass-sheet-root--hosted'),
      toolbar: htmlStyle.getPropertyValue('--os-toolbar-bottom').trim(),
      dockVar: htmlStyle.getPropertyValue('--portfolio-dock-bottom').trim(),
      panelVsDock: panelBox.bottom - dockBox.bottom,
      panelVsVisual: panelBox.bottom - visualBottom,
      restingFooter,
      sheetFooter,
      rootBottomCss: rootStyle.bottom,
      inlineBottom: root.style.bottom,
      inlinePaddingBottom: root.style.paddingBottom,
      nonHostedBottom,
      nonHostedPaddingBottom,
    };
  });
}

test.describe('brave toolbar gap', () => {
  for (const phone of PHONES) {
    test(`does not treat a 56px toolbar as the keyboard on ${phone.name} @webkit`, async ({
      page,
    }) => {
      await stubShorterVisualViewport(page, 56);
      await openPageDrawer(page, phone);
      const measured = await measureDrawer(page);
      expect(measured.hosted).toBe(true);
      expect(measured.keyboardOpen).toBe(false);
      expect(measured.toolbar).toBe('56px');
      expect(measured.dockVar).toBe('56px');
      expect(Math.abs(measured.panelVsDock)).toBeLessThan(2);
      expect(Math.abs(measured.panelVsVisual)).toBeLessThan(2);
      expect(measured.sheetFooter).toBe(measured.restingFooter);
      expect(measured.nonHostedBottom).toBe('56px');
      expect(measured.nonHostedPaddingBottom).toBe('0px');
    });
  }

  test('still pins a real keyboard @webkit', async ({ page }) => {
    await stubShorterVisualViewport(page, 300);
    await openPageDrawer(page, { width: 412, height: 915 });
    const measured = await measureDrawer(page);
    expect(measured.keyboardOpen).toBe(true);
    expect(measured.toolbar).toBe('0px');
    expect(measured.dockVar).toBe('300px');
    expect(measured.inlineBottom).toBe('auto');
    expect(['0', '0px']).toContain(measured.inlinePaddingBottom);
    expect(Math.abs(measured.panelVsVisual)).toBeLessThan(2);
    expect(measured.nonHostedBottom).toBe('0px');
  });

  test('keeps a zero toolbar gap on the resting layout @webkit', async ({
    page,
  }) => {
    await openPageDrawer(page, { width: 390, height: 844 });
    const phone = await measureDrawer(page);
    expect(phone.keyboardOpen).toBe(false);
    expect(phone.toolbar).toBe('0px');
    expect(phone.dockVar).toBe('0px');
    expect(phone.sheetFooter).toBe(phone.restingFooter);
    expect(Math.abs(phone.panelVsDock)).toBeLessThan(2);
    expect(Math.abs(phone.panelVsVisual)).toBeLessThan(2);
    expect(phone.nonHostedBottom).toBe('0px');
    expect(phone.nonHostedPaddingBottom).toBe('0px');

    await openPageDrawer(page, { width: 1280, height: 800 });
    const desktop = await measureDrawer(page);
    expect(desktop.keyboardOpen).toBe(false);
    expect(desktop.toolbar).toBe('0px');
    expect(desktop.dockVar).toBe('0px');
    expect(desktop.sheetFooter).toBe(desktop.restingFooter);
    expect(desktop.nonHostedBottom).toBe('0px');
    expect(desktop.nonHostedPaddingBottom).toBe('0px');
    expect(desktop.rootBottomCss).toBe(phone.rootBottomCss);
    expect(desktop.inlineBottom).toBe('');
  });
});
