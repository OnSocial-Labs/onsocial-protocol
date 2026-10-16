import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { gotoApp } from './helpers';

const KEYBOARD_LIFT_PX = 320;
const shots = existsSync('/opt/cursor/artifacts');

/** The form already sets these when a mobile field focuses and the keyboard lifts. */
async function publishKeyboard(page: Page, formSelector: string) {
  await page.locator(formSelector).evaluate((form, lift) => {
    form.setAttribute('data-keyboard', 'open');
    const screen = form.closest('.os-app-screen');
    if (screen instanceof HTMLElement) {
      screen.style.setProperty('--drop-create-keyboard-lift', `${lift}px`);
    }
  }, KEYBOARD_LIFT_PX);
}

async function expectLauncherResting(page: Page) {
  const dock = page.locator('.os-app-screen > .portfolio-summon-dock');
  const footer = page.locator('.os-app-screen-footer');
  await expect(dock).toBeVisible();
  await expect(footer.locator('.os-sheet-action').first()).toBeVisible();
  const opacity = await dock.evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe('1');
  const footerBottom = await footer.evaluate((el) =>
    parseFloat(getComputedStyle(el).bottom)
  );
  expect(footerBottom).toBeGreaterThan(40);
  expect(footerBottom).toBeLessThan(160);
}

async function expectActionOnKeys(page: Page) {
  const dock = page.locator('.os-app-screen > .portfolio-summon-dock');
  const footer = page.locator('.os-app-screen-footer');
  await expect
    .poll(() => footer.evaluate((el) => getComputedStyle(el).bottom))
    .toBe(`${KEYBOARD_LIFT_PX}px`);
  await expect
    .poll(() => dock.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
  const summonEvents = await dock
    .locator('.portfolio-summon')
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(summonEvents).toBe('none');
  await expect(footer.locator('.os-sheet-action').first()).toBeVisible();
}

test.describe('create keyboard dock', () => {
  test.describe.configure({ mode: 'serial' });

  test('hub, guild, and DAO tuck the launcher and sit the action on the keys', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await gotoApp(page, '/apps/create');
    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toBeVisible();
    await expectLauncherResting(page);
    if (shots) {
      await page.screenshot({
        path: '/opt/cursor/artifacts/create-hub-keyboard-resting.png',
      });
    }
    await publishKeyboard(page, '.hub-create-form');
    await expectActionOnKeys(page);
    if (shots) {
      await page.evaluate((lift) => {
        const band = document.createElement('div');
        band.setAttribute('data-shot-keyboard', '');
        band.style.cssText = [
          'position:fixed',
          'left:0',
          'right:0',
          'bottom:0',
          `height:${lift}px`,
          'background:#1c1c1e',
          'z-index:80',
          'pointer-events:none',
        ].join(';');
        document.body.appendChild(band);
      }, KEYBOARD_LIFT_PX);
      await page.screenshot({
        path: '/opt/cursor/artifacts/create-hub-keyboard-tuck.png',
      });
    }

    await gotoApp(page, '/groups/create');
    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
    await expectLauncherResting(page);
    await publishKeyboard(page, '.guild-create-form');
    await expectActionOnKeys(page);

    await gotoApp(page, '/daos/create');
    await expect(
      page.getByRole('heading', { name: 'Create DAO' })
    ).toBeVisible();
    await expectLauncherResting(page);
    await publishKeyboard(page, '.dao-create-form');
    await expectActionOnKeys(page);
  });

  test('new drop keeps its quiet launcher off the keys', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/drops/create');
    const form = page.locator('.drop-create-form');
    await expect(form).toBeVisible();
    await expect(form).not.toHaveClass(/hub-create-form/);
    const dock = page.locator('.os-app-screen > .portfolio-summon-dock');
    await expect(dock).toHaveClass(/is-scroll-hidden/);
    await publishKeyboard(page, '.drop-create-form');
    await expect
      .poll(() => dock.evaluate((el) => getComputedStyle(el).bottom))
      .toBe('0px');
    await expect
      .poll(() => dock.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('0');
  });
});
