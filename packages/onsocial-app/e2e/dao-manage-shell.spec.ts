import { expect, test } from '@playwright/test';
import {
  expectGlassSheetVisible,
  expectPortfolioIdentityOrSkip,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers';

const DAO_ACCOUNT =
  process.env.E2E_DAO_ACCOUNT ?? 'governance.onsocial.testnet';
const daoPath = `/@${DAO_ACCOUNT}`;

test.describe('DAO manage shell', () => {
  test('face chips open Manage with visitor tools', async ({ page }) => {
    await gotoApp(page, daoPath);
    await expectPortfolioIdentityOrSkip(page, DAO_ACCOUNT);
    await waitForPortfolioClientReady(page);

    const tools = page.getByRole('navigation', { name: 'DAO tools' });
    await expect(tools.getByRole('button', { name: 'Proposals' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(tools.getByRole('button', { name: 'Members' })).toBeVisible();
    await expect(tools.getByRole('button', { name: 'Treasury' })).toBeVisible();
    const manage = tools.getByRole('button', { name: 'Manage' });
    await expect(manage).toHaveAttribute('aria-expanded', 'false');

    await manage.click();
    await expect(manage).toHaveAttribute('aria-expanded', 'true');
    await expectGlassSheetVisible(page);
    await expect(page.getByRole('heading', { name: 'Manage' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Propose/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Stake/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Info/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Edit profile/ })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(manage).toHaveAttribute('aria-expanded', 'false');
  });

  test('Manage Info opens the policy snapshot', async ({ page }) => {
    await gotoApp(page, daoPath);
    await expectPortfolioIdentityOrSkip(page, DAO_ACCOUNT);
    await waitForPortfolioClientReady(page);

    await page.getByRole('button', { name: 'Manage' }).click();
    await page.getByRole('button', { name: /Info/ }).click();
    await expectGlassSheetVisible(page);
    await expect(
      page.getByText('On-chain policy snapshot for this board.')
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText('Connect a wallet to see your stake position.')
    ).toBeVisible();
  });

  test('family kind deep-link opens Proposals', async ({ page }) => {
    await gotoApp(page, `${daoPath}?kind=boost`);
    await expectPortfolioIdentityOrSkip(page, DAO_ACCOUNT);
    await waitForPortfolioClientReady(page);

    await expect(
      page.getByRole('navigation', { name: 'DAO tools' }).getByRole('button', {
        name: 'Proposals',
      })
    ).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    await expect(
      page.getByRole('textbox', { name: 'Search proposals' })
    ).toBeVisible({ timeout: 30_000 });
  });
});
