import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp, setLookPreviewFile } from './helpers';

const LOOK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('dao create voice', () => {
  test.describe.configure({ mode: 'serial' });

  test('Create DAO place asks Connect, not Connect wallet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos/create');
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toBeVisible();
    await dismissNextDevOverlay(page);
    await expect(page.getByRole('dialog', { name: /^Create DAO/ })).toHaveCount(
      0
    );
    await expect(
      page.getByText('Connect to create a DAO.', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(page.getByText('Deploys under the network factory')).toHaveCount(
      0
    );
    await expect(page.getByText('You get')).toHaveCount(0);
    await expect(page.getByText('Add links')).toHaveCount(0);
    await expect(page.getByText('Purpose', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add a purpose', exact: true })
    ).toBeVisible();
    const publish = page.getByRole('switch', {
      name: 'Publish OnSocial profile',
      exact: true,
    });
    await expect(publish).toBeVisible();
    await expect(publish).toHaveAttribute('aria-checked', 'false');
    await expect(publish).toHaveClass(/dao-create-publish/);
    await expect(publish).not.toHaveClass(/account-action-toggle/);
    await expect(page.locator('.os-surface-chip')).toHaveCount(0);
    await expect(page.locator('.os-write-dock-tool')).toHaveCount(0);
    await expect(page.locator('.dao-look-preview')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add cover', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add crest', exact: true })
    ).toBeVisible();
    await expect(page.locator('.dao-look-preview-crest-empty')).toHaveText('+');
    await expect(page.locator('.dao-create-name-row')).toHaveCount(0);
    const cover = page.locator('.dao-look-preview-cover');
    const crest = page.locator('.dao-look-preview-crest');
    const nameField = page.locator('#dao-create-name');
    await expect
      .poll(async () => {
        const coverBox = await cover.boundingBox();
        const crestBox = await crest.boundingBox();
        const nameBox = await nameField.boundingBox();
        if (!coverBox || !crestBox || !nameBox) return 'missing';
        const overlapsBottom =
          crestBox.y < coverBox.y + coverBox.height - 8 &&
          crestBox.y + crestBox.height > coverBox.y + coverBox.height;
        const centered =
          Math.abs(
            coverBox.x +
              coverBox.width / 2 -
              (crestBox.x + crestBox.width / 2)
          ) < 12;
        const nameBelow = nameBox.y > crestBox.y + crestBox.height - 4;
        return overlapsBottom && centered && nameBelow ? 'ready' : 'layout';
      })
      .toBe('ready');
    const footer = page.locator('.os-app-screen-footer');
    await expect(
      footer.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('You start as council · ~6 NEAR', { exact: true })
    ).toBeVisible();

    await publish.click();
    await expect(publish).toHaveAttribute('aria-checked', 'true');
    await expect(
      page.getByText('You start as council · ~6.1 NEAR', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Need ~')).toHaveCount(0);
    await expect(page.getByText(/bond/i)).toHaveCount(0);
    await expect(page.getByText(/gas/i)).toHaveCount(0);

    await publish.click();
    await expect(publish).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByText('You start as council · ~6 NEAR', { exact: true })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(page.getByText('You get')).toBeVisible();
    await expect(page.getByText('Add links')).toBeVisible();
    await expect(
      page.getByText('You start as council', { exact: true })
    ).toHaveCount(0);
    await expect(page.getByText('~6 NEAR to create')).toHaveCount(0);
    await expect(page.getByText('proposes a Call')).toHaveCount(0);

    await setLookPreviewFile(
      page,
      page.locator('[data-dao-look-file="cover"]'),
      {
        name: 'cover.png',
        mimeType: 'image/png',
        buffer: LOOK_PNG,
      },
      page.getByRole('button', { name: 'Change cover', exact: true })
    );
    await cover.hover();
    await expect(
      page.getByRole('button', { name: 'Remove cover' })
    ).toBeVisible();

    await setLookPreviewFile(
      page,
      page.locator('[data-dao-look-file="crest"]'),
      {
        name: 'crest.png',
        mimeType: 'image/png',
        buffer: LOOK_PNG,
      },
      page.getByRole('button', { name: 'Change crest', exact: true })
    );
    await crest.hover();
    await expect(
      page.getByRole('button', { name: 'Remove crest' })
    ).toBeVisible();

    await cover.hover();
    await page.getByRole('button', { name: 'Remove cover' }).click();
    await expect(
      page.getByRole('button', { name: 'Add cover', exact: true })
    ).toBeVisible();
    await crest.hover();
    await page.getByRole('button', { name: 'Remove crest' }).click();
    await expect(
      page.getByRole('button', { name: 'Add crest', exact: true })
    ).toBeVisible();
  });

  test('DAOs + opens the create place, not a sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos');
    await expect(page.getByRole('heading', { name: 'DAOs' })).toBeVisible();
    await dismissNextDevOverlay(page);
    await page.getByRole('link', { name: 'Create DAO' }).click();
    await page.waitForURL(/\/daos\/create\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /^Create DAO/ })).toHaveCount(
      0
    );
  });

  test('legacy ?create=1 redirects to /daos/create', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos?create=1');
    await page.waitForURL(/\/daos\/create\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toBeVisible();
  });

  test('dock Back leaves to DAOs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await gotoApp(page, '/daos/create');
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toBeVisible();
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForURL(/\/daos\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toHaveCount(
      0
    );
    await expect(page.getByRole('heading', { name: 'DAOs' })).toBeVisible();
  });

  test('dirty dock Back asks before leaving', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await gotoApp(page, '/daos/create');
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toBeVisible();
    await dismissNextDevOverlay(page);
    await page.locator('#dao-create-name').fill('Builders');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const discard = page.getByRole('dialog', { name: 'Discard DAO?' });
    await expect(discard).toBeVisible();
    await discard
      .locator('.os-sheet-action--primary')
      .filter({ hasText: 'Keep editing' })
      .click();
    await expect(discard).toHaveCount(0);
    await expect(page).toHaveURL(/\/daos\/create\/?$/);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discard DAO?' })).toBeVisible();
    await page
      .locator('.os-sheet-action--danger')
      .filter({ hasText: 'Discard' })
      .click();
    await page.waitForURL(/\/daos\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'DAOs' })).toBeVisible();
  });

  test('tracks field focus so the footer stays over the keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos/create');

    const form = page.locator('.dao-create-form');
    const footer = page.locator('.os-app-screen-footer');
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toBeVisible();
    await expect(form).toBeVisible();
    await expect(form).not.toHaveAttribute('data-form-focused');

    await dismissNextDevOverlay(page);
    const nameField = page.locator('#dao-create-name');
    await nameField.scrollIntoViewIfNeeded();
    await nameField.click();
    await nameField.focus();
    await expect(form).toHaveAttribute('data-form-focused', '');
    await expect(page.locator('#dao-create-name')).toBeInViewport();
    await expect(footer).toBeInViewport();
  });
});
