import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('dao create voice', () => {
  test('Create DAO sheet asks Connect, not Connect wallet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos');

    const create = page.getByRole('button', { name: 'Create DAO' });
    await expect(create).toBeVisible();
    await create.click({ force: true });

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
    await expect(sheet.locator('.os-write-dock-tool')).toHaveCount(0);
    await expect(sheet.locator('.dao-look-preview')).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Add cover', exact: true })
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Add crest', exact: true })
    ).toBeVisible();
    await expect(sheet.locator('.dao-look-preview-crest-empty')).toHaveText('+');
    await expect(sheet.locator('.dao-create-name-row')).toHaveCount(0);
    const cover = sheet.locator('.dao-look-preview-cover');
    const crest = sheet.locator('.dao-look-preview-crest');
    const nameField = sheet.locator('#dao-create-name');
    const coverBox = await cover.boundingBox();
    const crestBox = await crest.boundingBox();
    const nameBox = await nameField.boundingBox();
    expect(coverBox).toBeTruthy();
    expect(crestBox).toBeTruthy();
    expect(nameBox).toBeTruthy();
    expect(crestBox!.y).toBeLessThan(coverBox!.y + coverBox!.height - 8);
    expect(crestBox!.y + crestBox!.height).toBeGreaterThan(
      coverBox!.y + coverBox!.height
    );
    expect(
      Math.abs(
        coverBox!.x +
          coverBox!.width / 2 -
          (crestBox!.x + crestBox!.width / 2)
      )
    ).toBeLessThan(12);
    expect(nameBox!.y).toBeGreaterThan(crestBox!.y + crestBox!.height - 4);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
    await expect(
      sheet.getByText('You start as council · ~6 NEAR', { exact: true })
    ).toBeVisible();

    await publish.click();
    await expect(publish).toHaveAttribute('aria-checked', 'true');
    await expect(
      sheet.getByText('You start as council · ~6.1 NEAR', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Need ~')).toHaveCount(0);
    await expect(sheet.getByText(/bond/i)).toHaveCount(0);
    await expect(sheet.getByText(/gas/i)).toHaveCount(0);

    await publish.click();
    await expect(publish).toHaveAttribute('aria-checked', 'false');
    await expect(
      sheet.getByText('You start as council · ~6 NEAR', { exact: true })
    ).toBeVisible();

    await sheet.getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(sheet.getByText('You get')).toBeVisible();
    await expect(sheet.getByText('Add links')).toBeVisible();
    await expect(
      sheet.getByText('You start as council', { exact: true })
    ).toHaveCount(0);
    await expect(sheet.getByText('~6 NEAR to create')).toHaveCount(0);
    await expect(sheet.getByText('proposes a Call')).toHaveCount(0);

    const lookPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    await sheet.locator('[data-dao-look-file="cover"]').setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: lookPng,
    });
    await expect(
      sheet.getByRole('button', { name: 'Change cover', exact: true })
    ).toBeVisible();
    await cover.hover();
    await expect(
      sheet.getByRole('button', { name: 'Remove cover' })
    ).toBeVisible();

    await sheet.locator('[data-dao-look-file="crest"]').setInputFiles({
      name: 'crest.png',
      mimeType: 'image/png',
      buffer: lookPng,
    });
    await expect(
      sheet.getByRole('button', { name: 'Change crest', exact: true })
    ).toBeVisible();
    await crest.hover();
    await expect(
      sheet.getByRole('button', { name: 'Remove crest' })
    ).toBeVisible();

    await cover.hover();
    await sheet.getByRole('button', { name: 'Remove cover' }).click();
    await expect(
      sheet.getByRole('button', { name: 'Add cover', exact: true })
    ).toBeVisible();
    await crest.hover();
    await sheet.getByRole('button', { name: 'Remove crest' }).click();
    await expect(
      sheet.getByRole('button', { name: 'Add crest', exact: true })
    ).toBeVisible();
  });
});
