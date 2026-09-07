import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('dao create voice', () => {
  test('Create DAO sheet asks Connect, not Connect wallet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos');

    await page.getByRole('button', { name: 'Create DAO' }).click();

    const sheet = page.getByRole('dialog', { name: /^Create DAO/ });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(
      sheet.getByText('Connect to create a DAO.', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(sheet.getByText('Deploys under the network factory')).toHaveCount(
      0
    );
    await expect(sheet.getByText('You get')).toHaveCount(0);
    await expect(sheet.getByText('Add links')).toHaveCount(0);
    await expect(sheet.getByText('Purpose', { exact: true })).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Add a purpose', exact: true })
    ).toBeVisible();
    const publish = sheet.getByRole('switch', {
      name: 'Publish OnSocial profile',
      exact: true,
    });
    await expect(publish).toBeVisible();
    await expect(publish).toHaveAttribute('aria-checked', 'false');
    await expect(publish).toHaveClass(/dao-create-publish/);
    await expect(publish).not.toHaveClass(/account-action-toggle/);
    await expect(sheet.locator('.os-surface-chip')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Add cover', exact: true })
    ).toHaveClass(/os-write-dock-tool/);
    await expect(
      sheet.getByRole('button', { name: 'Add crest', exact: true })
    ).toHaveClass(/os-write-dock-tool/);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();

    await sheet.getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(sheet.getByText('You get')).toBeVisible();
    await expect(sheet.getByText('Add links')).toBeVisible();
    await expect(
      sheet.getByText('You start as council', { exact: true })
    ).toHaveCount(0);
    await expect(sheet.getByText('~6 NEAR to create')).toHaveCount(0);
    await expect(sheet.getByText('proposes a Call')).toHaveCount(0);
  });
});
