import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('create guild voice', () => {
  test('is a task sheet with footer Connect, not Connect wallet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups/create');

    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
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
    await expect(form).toBeVisible();
    await expect(form).not.toHaveAttribute('data-form-focused');

    await page.locator('#guild-create-name').focus();
    await expect(form).toHaveAttribute('data-form-focused', '');
    await expect(page.locator('#guild-create-name')).toBeInViewport();
    await expect(footer).toBeInViewport();
  });
});
