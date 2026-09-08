import { expect, test } from '@playwright/test';
import { gotoApp, setLookPreviewFile } from './helpers';

const LOOK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('create guild voice', () => {
  test('is a task sheet with footer Connect, not Connect wallet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups/create');

    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
    await expect(page.locator('.guild-look-preview')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add banner', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add badge', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add logo' })).toHaveCount(0);
    await expect(page.getByText('Cover', { exact: true })).toHaveCount(0);
    await expect(page.locator('.os-write-dock-tool')).toHaveCount(0);
    const banner = page.locator('.guild-look-preview-banner');
    const badge = page.locator('.guild-look-preview-badge');
    const nameField = page.locator('#guild-create-name');
    const bannerBox = await banner.boundingBox();
    const badgeBox = await badge.boundingBox();
    const nameBox = await nameField.boundingBox();
    expect(bannerBox).toBeTruthy();
    expect(badgeBox).toBeTruthy();
    expect(nameBox).toBeTruthy();
    expect(badgeBox!.y).toBeGreaterThan(bannerBox!.y + bannerBox!.height - 4);
    expect(
      Math.abs(
        badgeBox!.y +
          badgeBox!.height / 2 -
          (nameBox!.y + nameBox!.height / 2)
      )
    ).toBeLessThan(16);
    await expect(page.locator('.guild-look-preview-badge-empty')).toHaveText(
      '+'
    );
    await expect(page.locator('.portfolio-summon-dock')).toHaveCount(0);
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      page.locator('.os-app-screen-actions').getByRole('button', { name: 'Close' })
    ).toBeVisible();
    const footer = page.locator('.os-app-screen-footer');
    await expect(footer.getByRole('button', { name: 'Connect' })).toBeVisible();
    const footerGap = await footer.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return Math.round(window.innerHeight - box.bottom);
    });
    expect(footerGap).toBeLessThan(16);

    await expect(
      page.getByRole('button', { name: 'Add about', exact: true })
    ).toBeVisible();
    await expect(page.locator('#guild-create-description')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Advanced' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Add about', exact: true }).click();
    await expect(page.locator('#guild-create-description')).toBeVisible();
    await page
      .locator('#guild-create-description')
      .fill('Builder Room ships weekly.');
    await page.getByRole('button', { name: 'Hide about', exact: true }).click();
    await expect(page.locator('#guild-create-description')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Edit about', exact: true })
    ).toBeVisible();

    await expect(page.getByRole('radio', { name: 'Open' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Invite only' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Collaborative' })).toBeVisible();
  });

  test('previews banner and badge like the guild page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups/create');

    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
    const banner = page.locator('.guild-look-preview-banner');
    const badge = page.locator('.guild-look-preview-badge');
    const nameField = page.locator('#guild-create-name');
    await expect(banner).toBeVisible();
    await expect(badge).toBeVisible();
    const bannerBox = await banner.boundingBox();
    const badgeBox = await badge.boundingBox();
    const nameBox = await nameField.boundingBox();
    expect(bannerBox).toBeTruthy();
    expect(badgeBox).toBeTruthy();
    expect(nameBox).toBeTruthy();
    expect(badgeBox!.y).toBeGreaterThan(bannerBox!.y + bannerBox!.height - 4);
    expect(
      Math.abs(
        badgeBox!.y +
          badgeBox!.height / 2 -
          (nameBox!.y + nameBox!.height / 2)
      )
    ).toBeLessThan(16);
    expect(bannerBox!.height).toBeLessThan(110);

    await setLookPreviewFile(
      page,
      '[data-guild-look-file="banner"]',
      {
        name: 'banner.png',
        mimeType: 'image/png',
        buffer: LOOK_PNG,
      },
      page.getByRole('button', { name: 'Change banner', exact: true })
    );
    await banner.hover();
    await expect(page.getByRole('button', { name: 'Remove banner' })).toBeVisible();

    await setLookPreviewFile(
      page,
      '[data-guild-look-file="badge"]',
      {
        name: 'badge.png',
        mimeType: 'image/png',
        buffer: LOOK_PNG,
      },
      page.getByRole('button', { name: 'Change badge', exact: true })
    );
    await badge.hover();
    await expect(page.getByRole('button', { name: 'Remove badge' })).toBeVisible();

    await banner.hover();
    await page.getByRole('button', { name: 'Remove banner' }).click();
    await expect(
      page.getByRole('button', { name: 'Add banner', exact: true })
    ).toBeVisible();
    await badge.hover();
    await page.getByRole('button', { name: 'Remove badge' }).click();
    await expect(
      page.getByRole('button', { name: 'Add badge', exact: true })
    ).toBeVisible();
  });

  test('closes to Guilds', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups/create');
    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
    await page
      .locator('.os-app-screen-actions')
      .getByRole('button', { name: 'Close' })
      .click();
    await expect(page).toHaveURL(/\/groups\/?$/);
    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toHaveCount(0);
  });

  test('tracks field focus so the footer stays over the keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups/create');

    const form = page.locator('.guild-create-form');
    const footer = page.locator('.os-app-screen-footer');
    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
    await expect(form).toBeVisible();
    await expect(form).not.toHaveAttribute('data-form-focused');

    const nameField = page.locator('#guild-create-name');
    await nameField.scrollIntoViewIfNeeded();
    await nameField.click();
    await nameField.focus();
    await expect(form).toHaveAttribute('data-form-focused', '');
    await expect(page.locator('#guild-create-name')).toBeInViewport();
    await expect(footer).toBeInViewport();
  });
});
