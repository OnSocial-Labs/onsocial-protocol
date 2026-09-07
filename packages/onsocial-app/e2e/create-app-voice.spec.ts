import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('create app voice', () => {
  test('waits About behind Add about', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');

    await expect(
      page.getByRole('heading', { name: 'Open a hub' })
    ).toBeVisible();
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
