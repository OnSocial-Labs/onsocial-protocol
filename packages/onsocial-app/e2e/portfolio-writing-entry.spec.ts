import { expect, test, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, dismissNextDevOverlay, gotoApp } from './helpers';
import { setE2eGraphProfile, setE2eGraphWriting } from './helpers/e2e-graph';

const ACCOUNT = 'alice.testnet';

async function seedViewer(page: Page, accountId: string | null): Promise<void> {
  await page.addInitScript(
    `(() => {
      try {
        var id = ${JSON.stringify(accountId)};
        if (id) localStorage.setItem('onsocial.app.wallet.accountId', id);
        else localStorage.removeItem('onsocial.app.wallet.accountId');
      } catch (error) {}
    })();`
  );
}

test.describe('portfolio writing entry', () => {
  test('hides Writing for a visitor with no articles and leaves the shelf @webkit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedViewer(page, null);
    await setE2eGraphProfile(page, 'links');
    await setE2eGraphWriting(page, 'empty');
    await gotoApp(page, `/@${ACCOUNT}`);
    await dismissNextDevOverlay(page);
    await expect(page.getByRole('link', { name: 'Writing', exact: true })).toBeHidden();
    await gotoApp(page, `/@${ACCOUNT}/writing`);
    await page.waitForURL(new RegExp(`/@${ACCOUNT}/?$`), {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(page.getByText('Longer pieces live here.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Writing', exact: true })).toBeHidden();
  });

  test('keeps the empty invitation on the owner’s shelf @webkit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await seedViewer(page, ACCOUNT);
    await setE2eGraphProfile(page, 'links');
    await setE2eGraphWriting(page, 'empty');
    await gotoApp(page, `/@${ACCOUNT}`);
    await dismissNextDevOverlay(page);
    await expect(page.getByRole('link', { name: 'Writing', exact: true })).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await gotoApp(page, `/@${ACCOUNT}/writing`);
    await expect(page).toHaveURL(new RegExp(`/@${ACCOUNT}/writing/?$`));
    await expect(page.getByText('Longer pieces live here.')).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(
      page
        .getByRole('article')
        .getByRole('button', { name: 'Write an article', exact: true })
    ).toBeVisible();
  });

  test('keeps Writing when the account has articles @webkit', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await seedViewer(page, null);
    await setE2eGraphProfile(page, 'links');
    await setE2eGraphWriting(page, 'shelf');
    await gotoApp(page, `/@${ACCOUNT}`);
    await dismissNextDevOverlay(page);
    await expect(page.getByRole('link', { name: 'Writing', exact: true })).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await gotoApp(page, `/@${ACCOUNT}/writing`);
    await expect(page).toHaveURL(new RegExp(`/@${ACCOUNT}/writing/?$`));
    await expect(page.getByRole('link', { name: 'Night drive' })).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(page.getByText('Longer pieces live here.')).toHaveCount(0);
  });
});
