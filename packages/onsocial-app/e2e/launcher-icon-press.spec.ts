import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

test.describe('launcher icon press', () => {
  test('keeps the icon the same size while the color marks it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    await page.getByRole('button', { name: 'Open launcher' }).click();
    const launcher = page.getByRole('dialog', { name: 'OnSocial launcher' });
    const item = launcher
      .locator('.os-launcher-item:not(.is-soon):not(.is-current)')
      .first();
    const shell = item.locator('.os-launcher-item-icon-shell');
    const icon = item.locator('.os-launcher-item-icon');
    await expect(shell).toBeVisible();

    const rest = await shell.evaluate((el) => {
      const style = getComputedStyle(el);
      return { transform: style.transform, width: style.width };
    });
    const restInk = await icon.evaluate((el) => getComputedStyle(el).color);

    await item.hover();
    await expect
      .poll(() => icon.evaluate((el) => getComputedStyle(el).color))
      .not.toBe(restInk);

    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    const pressed = await shell.evaluate((el) => {
      const style = getComputedStyle(el);
      return { transform: style.transform, width: style.width };
    });
    await page.mouse.up();

    expect(pressed.transform).toBe(rest.transform);
    expect(pressed.width).toBe(rest.width);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(pressed.transform);
  });
});
