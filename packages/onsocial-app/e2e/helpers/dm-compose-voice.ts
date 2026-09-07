import { expect, test, type Page } from '@playwright/test';
import { gotoApp, waitForPortfolioClientReady } from './navigation';

export const DM_E2E_ACCOUNT = 'alice.testnet';

/** Soft-open Message compose from the logged-out face. */
export async function openDmComposeLoggedOut(page: Page): Promise<void> {
  await gotoApp(page, `/@${DM_E2E_ACCOUNT}`);
  await waitForPortfolioClientReady(page);

  const missing = page.getByRole('heading', { name: 'Account not found' });
  const identity = page.locator('.portfolio-identity');
  if (
    (await missing.isVisible().catch(() => false)) &&
    !(await identity.isVisible().catch(() => false))
  ) {
    test.skip(true, `Portfolio account ${DM_E2E_ACCOUNT} not found`);
  }
  await expect(identity).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Message', exact: true }).click();
}
