import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

const LOOK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('create app voice', () => {
  test('waits About behind Add about', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');

    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toBeVisible();
    await expect(page.locator('.hub-look-preview')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add banner', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add logo', exact: true })
    ).toBeVisible();
    await expect(page.locator('.os-write-dock-tool')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add link' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add about', exact: true })
    ).toBeVisible();
    await expect(page.locator('#app-create-description')).toHaveCount(0);
    await expect(page.getByText('About', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Advanced' })).toHaveCount(0);

    await expect(page.getByText('Your commission', { exact: true })).toBeVisible();
    await expect(page.getByText('Category', { exact: true })).toBeVisible();
    const categorySlider = page.locator(
      '.hub-categories-editor .topic-chip-slider'
    );
    await expect(categorySlider).toBeVisible();
    const sliderBox = await categorySlider.boundingBox();
    expect(sliderBox).toBeTruthy();
    expect(sliderBox!.height).toBeLessThan(48);
    await expect(
      page.getByText('Who can create drops', { exact: true })
    ).toBeVisible();
    const access = page.getByRole('radiogroup', { name: 'Who can create drops' });
    await expect(access.getByRole('radio', { name: 'Anyone' })).toBeVisible();
    await expect(access.getByRole('radio', { name: 'Approved' })).toBeVisible();
    await expect(access.getByRole('radio', { name: 'House' })).toBeVisible();
    await expect(access.getByRole('radio', { name: 'Staff' })).toHaveCount(0);
    await expect(access.getByRole('radio', { name: 'Approval' })).toHaveCount(0);
    await expect(page.getByText('Anyone can drop', { exact: true })).toBeVisible();
    await expect(page.locator('.portfolio-summon-dock')).toHaveCount(0);
    await expect(
      page.locator('.os-app-screen-actions').getByRole('button', { name: 'Close' })
    ).toBeVisible();
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      page
        .locator('.os-app-screen-footer')
        .getByRole('button', { name: /^(Connect|Open hub)$/ })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Add about', exact: true }).click();
    await expect(page.locator('#app-create-description')).toBeVisible();
    await expect(page.getByText('About', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Hide about', exact: true })
    ).toBeVisible();

    await page
      .locator('#app-create-description')
      .fill('Midnight Records publishes live sessions.');
    await page.getByRole('button', { name: 'Hide about', exact: true }).click();
    await expect(page.locator('#app-create-description')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Edit about', exact: true })
    ).toBeVisible();
  });

  test('previews banner and logo like the hub page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');

    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add banner', exact: true })
    ).toBeVisible();
    await page.locator('#app-create-name').click();
    const banner = page.locator('.hub-look-preview-banner');
    const logo = page.locator('.hub-look-preview-logo');
    await expect(banner).toBeVisible();
    await expect(logo).toBeVisible();
    const bannerBox = await banner.boundingBox();
    const logoBox = await logo.boundingBox();
    expect(bannerBox).toBeTruthy();
    expect(logoBox).toBeTruthy();
    expect(logoBox!.y).toBeLessThan(bannerBox!.y + bannerBox!.height - 8);
    expect(logoBox!.y + logoBox!.height).toBeGreaterThan(
      bannerBox!.y + bannerBox!.height
    );
    expect(bannerBox!.height).toBeLessThan(110);
    const nameLabel = page.locator('.guild-field', { has: page.locator('#app-create-name') });
    const idLabel = page.locator('.guild-field', { has: page.locator('#app-create-id') });
    const nameBox = await nameLabel.boundingBox();
    const idBox = await idLabel.boundingBox();
    expect(nameBox).toBeTruthy();
    expect(idBox).toBeTruthy();
    const logoToName = nameBox!.y - (logoBox!.y + logoBox!.height);
    const nameToId = idBox!.y - (nameBox!.y + nameBox!.height);
    expect(Math.abs(logoToName - nameToId)).toBeLessThan(6);

    await page.locator('[data-hub-look-file="banner"]').setInputFiles({
      name: 'banner.png',
      mimeType: 'image/png',
      buffer: LOOK_PNG,
    });
    await expect(
      page.getByRole('button', { name: 'Change banner', exact: true })
    ).toBeVisible();
    await expect(page.locator('.hub-look-preview img').first()).toBeVisible();
    await page.locator('.hub-look-preview-banner').hover();
    await expect(page.getByRole('button', { name: 'Remove banner' })).toBeVisible();

    await page.locator('[data-hub-look-file="logo"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: LOOK_PNG,
    });
    await expect(
      page.getByRole('button', { name: 'Change logo', exact: true })
    ).toBeVisible();
    await expect(page.locator('.hub-look-preview img')).toHaveCount(2);
    await page.locator('.hub-look-preview-logo').hover();
    await expect(page.getByRole('button', { name: 'Remove logo' })).toBeVisible();

    await page.locator('.hub-look-preview-banner').hover();
    await page.getByRole('button', { name: 'Remove banner' }).click();
    await expect(
      page.getByRole('button', { name: 'Add banner', exact: true })
    ).toBeVisible();
    await page.locator('.hub-look-preview-logo').hover();
    await page.getByRole('button', { name: 'Remove logo' }).click();
    await expect(
      page.getByRole('button', { name: 'Add logo', exact: true })
    ).toBeVisible();
  });

  test('locks Connect in the footer and closes to Hubs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');

    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toBeVisible();
    await expect(page.locator('.portfolio-summon-dock')).toHaveCount(0);
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    const footer = page.locator('.os-app-screen-footer');
    await expect(footer.getByRole('button', { name: 'Connect' })).toBeVisible();
    await expect(footer).toBeInViewport();
    const footerGap = await footer.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return Math.round(window.innerHeight - box.bottom);
    });
    expect(footerGap).toBeLessThan(16);

    await page
      .locator('.os-app-screen-actions')
      .getByRole('button', { name: 'Close' })
      .click();
    await expect(page).toHaveURL(/\/apps\/?$/);
    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toHaveCount(0);
  });

  test('tracks field focus so the footer stays over the keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');

    const form = page.locator('.hub-create-form');
    const footer = page.locator('.os-app-screen-footer');
    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toBeVisible();
    await expect(form).toBeVisible();
    await expect(form).not.toHaveAttribute('data-form-focused');
    await expect(page.locator('.portfolio-summon-dock')).toHaveCount(0);

    const nameField = page.locator('#app-create-name');
    await nameField.scrollIntoViewIfNeeded();
    await nameField.click();
    await nameField.focus();
    await expect(form).toHaveAttribute('data-form-focused', '');
    await expect(page.locator('#app-create-name')).toBeInViewport();
    await expect(footer).toBeInViewport();

    const commissionField = page.locator('#app-create-commission');
    await commissionField.scrollIntoViewIfNeeded();
    await commissionField.click();
    await commissionField.focus();
    await expect(form).toHaveAttribute('data-form-focused', '');
    await expect(page.locator('#app-create-commission')).toBeInViewport();
    await expect(footer).toBeInViewport();
  });
});
