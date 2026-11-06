import { expect, test, type Page, type Response } from '@playwright/test';
import { seedE2eWallet } from './helpers/collection-page';
import { dismissNextDevOverlay, gotoApp } from './helpers/navigation';

const VIEWER = 'stranger.onsocial.testnet';
const GUILD = '/groups/grp_md_perm_1779813274071_ojf237';
const ROUTE_NOT_ALLOWED = 'OnAPI proxy route is not allowed';

function watchProxy(page: Page) {
  const denied: string[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (response: Response) => {
    if (!response.url().includes('/api/onapi/')) return;
    if (response.status() !== 404) return;
    const path = new URL(response.url()).pathname;
    pending.push(
      response.text().then((body) => {
        if (body.includes(ROUTE_NOT_ALLOWED)) denied.push(path);
      })
    );
  });
  return { denied, pending };
}

test('browse data reads are not blocked by the proxy allowlist', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedE2eWallet(page, VIEWER);
  const proxy = watchProxy(page);

  for (const path of ['/home', '/discover', '/market', '/groups']) {
    await gotoApp(page, path);
  }

  await gotoApp(page, GUILD);
  await gotoApp(page, '/@greenghost.onsocial.testnet');

  await dismissNextDevOverlay(page);
  await page.getByRole('button', { name: /You, @/ }).click();
  await page.getByRole('button', { name: /^Storage/ }).click();
  await expect(page.getByRole('dialog', { name: 'Storage' })).toBeVisible();

  await Promise.all(proxy.pending);
  expect(proxy.denied).toEqual([]);
});
