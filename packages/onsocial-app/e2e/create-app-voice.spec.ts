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
    await expect(
      page.getByRole('button', { name: 'Add banner', exact: true })
    ).toHaveClass(/os-write-dock-tool/);
    await expect(
      page.getByRole('button', { name: 'Add logo', exact: true })
    ).toHaveClass(/os-write-dock-tool/);
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
    await expect(page.getByRole('button', { name: 'Open hub' })).toBeVisible();

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

  test('picks banner and logo with the write-dock tools', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');

    await page.locator('[data-hub-create-file="banner"]').setInputFiles({
      name: 'banner.png',
      mimeType: 'image/png',
      buffer: LOOK_PNG,
    });
    await expect(page.getByRole('button', { name: 'Remove banner' })).toBeVisible();
    await expect(page.locator('.hub-create-media img').first()).toBeVisible();

    await page.locator('[data-hub-create-file="logo"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: LOOK_PNG,
    });
    await expect(page.getByRole('button', { name: 'Remove logo' })).toBeVisible();
    await expect(page.locator('.hub-create-media img')).toHaveCount(2);

    await page.getByRole('button', { name: 'Remove banner' }).click();
    await expect(
      page.getByRole('button', { name: 'Add banner', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Remove logo' }).click();
    await expect(
      page.getByRole('button', { name: 'Add logo', exact: true })
    ).toBeVisible();
  });

  test('tracks field focus so the dock can lift over the keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');

    const form = page.locator('.drop-create-form');
    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toBeVisible();
    await expect(form).toBeVisible();
    await expect(form).not.toHaveAttribute('data-form-focused');

    await page.locator('#app-create-name').click();
    await expect(form).toHaveAttribute('data-form-focused', '');
    await expect(page.locator('#app-create-name')).toBeInViewport();

    await page.locator('#app-create-commission').click();
    await expect(form).toHaveAttribute('data-form-focused', '');
    await expect(page.locator('#app-create-commission')).toBeInViewport();
  });
});
