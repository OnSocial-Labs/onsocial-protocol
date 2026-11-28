import { expect, test, type Page } from '@playwright/test';
import { setE2eGraphWriting } from './helpers/e2e-graph';
import {
  dismissNextDevOverlay,
  e2ePortfolioAccountId,
  gotoApp,
  settledNode,
} from './helpers';

const ACCOUNT = e2ePortfolioAccountId();

test.describe('article reader commerce', () => {
  test('mint opens the sheet and Drop opens the drop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphWriting(page, 'reader');
    await gotoApp(page, `/@${ACCOUNT}/writing/night`);
    await dismissNextDevOverlay(page);

    const mint = page.getByRole('button', { name: /^Mint/ });
    await expect(mint).toBeVisible();
    await expect(page.getByRole('link', { name: 'Drop' })).toHaveAttribute(
      'href',
      '/collection/night-essay'
    );
    await expect(page.getByRole('link', { name: 'Night roads' })).toHaveCount(
      0
    );
    await expect(page.getByRole('link', { name: 'Hub' })).toHaveAttribute(
      'href',
      '/apps/alice-press'
    );
    await expect(page.getByRole('link', { name: 'Market' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Drop' })).toHaveCount(0);

    await mint.click();
    const sheet = page.getByRole('dialog', { name: 'Mint' });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/writing/night/?$`));
    await sheet.getByRole('button', { name: 'Close mint scarce' }).click();
    await expect(sheet).toHaveCount(0);

    await page.getByRole('link', { name: 'Drop' }).click();
    await expect(page).toHaveURL(/\/collection\/night-essay\/?$/);
    await expect(page.getByRole('dialog', { name: 'Mint' })).toHaveCount(0);
    await expect(page.locator('.collection-title')).toHaveText('Night drive');
    await expect(
      page.getByRole('link', { name: 'Night roads' })
    ).toHaveAttribute('href', `/series/${ACCOUNT}/night-roads`);
  });

  test('Read opened from the drop stays on that drop', async ({ page }) => {
    const { drop, reader } = await openNightRead(page);

    await expect(reader).not.toHaveAttribute('data-keep-dock', 'true');
    const dock = settledNode(page, '.portfolio-summon-dock');
    await expect
      .poll(async () =>
        dock.evaluate((el) => {
          const style = getComputedStyle(el);
          return style.opacity === '0' && style.pointerEvents === 'none';
        })
      )
      .toBe(true);

    await page.goBack();
    await expect(reader).toHaveCount(0);
    await expect(drop).toBeVisible();
    await expect(drop.locator('.collection-title')).toHaveText('Night drive');
    await expect(page).toHaveURL(/\/collection\/night-essay\/?$/);
    await expect
      .poll(async () => dock.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');

    await page.goBack();
    await expect(drop).toHaveCount(0);
    await expect(page).toHaveURL(
      new RegExp(`/@${accountPattern(ACCOUNT)}/writing/night/?$`)
    );
  });

  test('author byline inside Read returns to the reader', async ({ page }) => {
    const { drop, reader } = await openNightRead(page);
    const byline = reader.locator(
      '.collection-writing-byline a, .portfolio-writing-article-author a'
    );
    await expect(byline).toBeVisible();
    await byline.click();
    await expect(page).toHaveURL(new RegExp(`/@${accountPattern(ACCOUNT)}/?$`));
    await expect(reader).not.toBeVisible();
    const profileDock = settledNode(page, '.portfolio-summon-dock');
    await expect
      .poll(async () =>
        profileDock.evaluate((el) => {
          const dock = getComputedStyle(el);
          const pill = el.querySelector('.portfolio-summon');
          const events = pill ? getComputedStyle(pill).pointerEvents : 'none';
          return `${dock.opacity}|${events}`;
        })
      )
      .toBe('1|auto');

    await page.goBack();
    await expect(reader).toBeVisible();
    await expect(drop).toHaveCount(1);
    await expect(drop.locator('.collection-title')).toHaveText('Night drive');
  });
});

/** Drop is open, its dock is on screen, then Read covers that drop. */
async function openNightRead(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2eGraphWriting(page, 'reader');
  await gotoApp(page, `/@${ACCOUNT}/writing/night`);
  await dismissNextDevOverlay(page);

  await page.getByRole('link', { name: 'Drop', exact: true }).click();
  const drop = page.locator('[data-drop-layer-sheet]');
  await expect(drop).toBeVisible({ timeout: 15_000 });
  await expect(drop.locator('.collection-title')).toHaveText('Night drive');
  const dock = settledNode(page, '.portfolio-summon-dock');
  await expect
    .poll(async () => dock.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  await drop.getByRole('button', { name: 'Read', exact: true }).click();
  const reader = page.locator('[data-os-slide-over="true"].feed-article-slide');
  await expect(reader).toBeVisible({ timeout: 15_000 });
  return { drop, reader };
}

function accountPattern(accountId: string): string {
  return accountId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
