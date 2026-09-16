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
    const manageButton = tools.getByRole('button', { name: 'Manage' });
    await expect(manageButton).toHaveAttribute('aria-expanded', 'false');

    await manageButton.click();
    await expect(manageButton).toHaveAttribute('aria-expanded', 'true');
    await expectGlassSheetVisible(page);
    const manageDialog = page.getByRole('dialog', { name: 'Manage' });
    await expect(manageDialog).toBeVisible();
    await expect(manageDialog).toHaveClass(/os-choice-sheet-panel/);
    await expect(manageDialog).toHaveClass(/os-sheet-cap-short/);
    await expect(
      manageDialog.getByRole('heading', { name: 'Manage' })
    ).toBeVisible();
    await expect(
      manageDialog.getByRole('menuitem', { name: /Propose/ })
    ).toBeVisible();
    await expect(
      manageDialog.getByRole('menuitem', { name: /Stake/ })
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      manageDialog.getByRole('menuitem', { name: /Settings/ })
    ).toBeVisible();
    await expect(
      manageDialog.getByRole('menuitem', { name: /Info/ })
    ).toBeVisible();
    await expect(
      manageDialog.getByRole('menuitem', { name: /Edit profile/ })
    ).toHaveCount(0);

    await manageDialog
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(manageButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('Propose opens a compact hug picker, not a page overlay', async ({
    page,
  }) => {
    await gotoApp(page, daoPath);
    await expectPortfolioIdentityOrSkip(page, DAO_ACCOUNT);
    await waitForPortfolioClientReady(page);

    await page.getByRole('button', { name: 'Manage' }).click();
    await page.getByRole('menuitem', { name: /Propose/ }).click();
    await expectGlassSheetVisible(page);
    const propose = page.getByRole('dialog', { name: 'Propose' });
    await expect(propose).toBeVisible({ timeout: 30_000 });
    await expect(propose).toHaveAttribute('data-sizing', 'hug');
    await expect(propose).toHaveClass(/os-choice-sheet-panel/);
    await expect(propose).toHaveClass(/os-sheet-cap-short/);
    await expect(propose).not.toHaveAttribute('data-surface', 'page');
    await expect(
      propose.getByRole('button', { name: 'Close propose' })
    ).toBeVisible();
    await expect(
      propose.getByText('Connect a wallet to propose.')
    ).toBeVisible();
    await expect(propose.getByText('COMMON')).toHaveCount(0);
    await expect(propose.getByText('Signal')).toHaveCount(0);
  });

  test('Manage Info opens the policy snapshot', async ({ page }) => {
    await gotoApp(page, daoPath);
    await expectPortfolioIdentityOrSkip(page, DAO_ACCOUNT);
    await waitForPortfolioClientReady(page);

    await page.getByRole('button', { name: 'Manage' }).click();
    await page.getByRole('menuitem', { name: /Info/ }).click();
    const info = page.getByRole('dialog', { name: 'Info' });
    await expect(info).toBeVisible({ timeout: 30_000 });
    await expect(info).toHaveAttribute('data-sizing', 'hug');
    await expect(
      info.getByText('On-chain policy snapshot for this board.')
    ).toBeVisible();
    await expect(
      info.getByText('Connect a wallet to see your stake position.')
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

  test('long purpose face ellipsis opens a bio hug, not About', async ({
    page,
  }) => {
    await gotoApp(page, daoPath);
    await expectPortfolioIdentityOrSkip(page, DAO_ACCOUNT);
    await waitForPortfolioClientReady(page);

    const identity = page
      .getByRole('main')
      .locator('.portfolio-identity')
      .first();
    await expect(
      identity.getByRole('link', { name: 'About', exact: true })
    ).toHaveCount(0);

    const expand = identity.getByRole('button', { name: 'Read full bio' });
    await expect(expand).toBeVisible({ timeout: 30_000 });
    await expand.getByText(/OnSocial exists to give every user/).click();
    await expectGlassSheetVisible(page);

    const bio = page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: 'Close bio' }),
    });
    await expect(bio).toBeVisible();
    await expect(bio).toHaveAttribute('data-sizing', 'hug');
    await expect(bio).not.toHaveAttribute('data-surface', 'page');
    await expect(
      bio.getByText(/The DAO exists only to protect these principles/)
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/about(?:\/|$|\?)/);

    const close = bio.getByRole('button', { name: 'Close bio' });
    await expect(close).toBeVisible();
    await close.click();
    await expect(bio).toHaveCount(0, { timeout: 10_000 });
    await expect(expand).toBeVisible();
  });

  test('Members and Treasury open as hug drawers, not pages or slide-overs', async ({
    page,
  }) => {
    await gotoApp(page, daoPath);
    await expectPortfolioIdentityOrSkip(page, DAO_ACCOUNT);
    await waitForPortfolioClientReady(page);

    const tools = page.getByRole('navigation', { name: 'DAO tools' });
    await tools.getByRole('button', { name: 'Members' }).click();
    await expectGlassSheetVisible(page);
    const membersSheet = page.locator(
      '.glass-sheet-root.is-visible .dao-org-hug'
    );
    await expect(membersSheet).toBeVisible({ timeout: 30_000 });
    await expect(membersSheet).toHaveAttribute('data-sizing', 'hug');
    await expect(membersSheet).toHaveAttribute('data-surface', 'glass');
    await expect(page.locator('.glass-sheet-root.is-visible')).toHaveAttribute(
      'data-presentation',
      'enter'
    );
    const membersDialog = page.getByRole('dialog', { name: 'Members' });
    await expect(membersDialog).toBeVisible();
    // Backdrop + header share this aria-label; only the header lives in the dialog.
    const membersClose = membersDialog.getByRole('button', {
      name: 'Close members',
    });
    await expect(membersClose).toBeVisible();
    await expect(membersSheet.locator('.os-app-screen--embedded')).toHaveCount(
      0
    );
    await expect(page.locator('.os-page-sheet-panel.dao-org-hug')).toHaveCount(
      0
    );
    await expect(page.locator('.dao-members-slide')).toHaveCount(0);
    await expect(page.locator('[data-os-slide-over="true"]')).toHaveCount(0);

    await membersClose.click();
    await expect(membersSheet).toHaveCount(0, { timeout: 10_000 });

    await tools.getByRole('button', { name: 'Treasury' }).click();
    await expectGlassSheetVisible(page);
    const treasurySheet = page.locator(
      '.glass-sheet-root.is-visible .dao-org-hug'
    );
    await expect(treasurySheet).toBeVisible({ timeout: 30_000 });
    await expect(treasurySheet).toHaveAttribute('data-sizing', 'hug');
    await expect(treasurySheet).toHaveAttribute('data-surface', 'glass');
    const treasuryDialog = page.getByRole('dialog', { name: 'Treasury' });
    await expect(treasuryDialog).toBeVisible();
    await expect(
      treasuryDialog.getByRole('button', { name: 'Close treasury' })
    ).toBeVisible();
    await expect(treasurySheet.locator('.os-app-screen--embedded')).toHaveCount(
      0
    );
    await expect(page.locator('.dao-treasury-slide')).toHaveCount(0);
    await expect(page.locator('[data-os-slide-over="true"]')).toHaveCount(0);
  });
});
