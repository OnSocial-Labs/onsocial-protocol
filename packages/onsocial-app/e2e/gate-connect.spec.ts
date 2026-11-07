import { expect, test } from '@playwright/test';
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
