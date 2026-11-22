import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';
import { setE2eGraphDrops } from './helpers/e2e-graph';
import {
  openSignedInMarket,
  sectionGapPx,
} from './helpers/skeleton-d-sections';

const ARTIFACTS = '/opt/cursor/artifacts';
const SHOT_LOG = `${ARTIFACTS}/skeleton-d-shots.jsonl`;

async function settled(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => {
    const portal = document.querySelector('nextjs-portal');
    return !/\bCompiling\b/.test(portal?.shadowRoot?.textContent ?? '');
  });
  await page.waitForTimeout(600);
}

for (const width of [390, 1280] as const) {
  test(`section gaps match the page column at ${width}`, async ({ page }) => {
    const height = width === 390 ? 844 : 800;
    await page.setViewportSize({ width, height });
    const sha = execSync('git rev-parse HEAD', {
      cwd: '/agent/repos/onsocial-protocol',
    })
      .toString()
      .trim();

    await setE2eGraphDrops(page, 'events');
    await gotoApp(page, '/events');
    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: 'Past' })).toBeVisible();
    const events = await sectionGapPx(
      page,
      '[aria-labelledby="events-upcoming"]',
      '[aria-labelledby="events-past"]'
    );
    expect(events.distance).toBeGreaterThan(0);
    await settled(page);
    const eventsPath = `${ARTIFACTS}/skeleton-d-events-${width}.png`;
    await page.screenshot({ path: eventsPath });
    appendFileSync(
      SHOT_LOG,
      `${JSON.stringify({
        sha,
        name: 'events',
        path: eventsPath,
        url: page.url(),
        viewport: { width, height },
        gapPx: events,
        time: new Date().toISOString(),
      })}\n`
    );

    await openSignedInMarket(page);
    await gotoApp(page, '/market');
    await expect(page.getByRole('heading', { name: 'Yours' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page
        .locator('[aria-labelledby="market-yours"]')
        .getByText('Night Drive')
        .first()
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recent sales' })
    ).toBeVisible();
    await expect(page.getByText('Night sale').first()).toBeVisible();
    const market = await sectionGapPx(
      page,
      '[aria-labelledby="market-yours"]',
      '[aria-labelledby="market-sales"]'
    );
    expect(market.distance).toBeGreaterThan(0);
    await page.locator('#market-sales').evaluate((el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await settled(page);
    const marketPath = `${ARTIFACTS}/skeleton-d-market-${width}.png`;
    await page.screenshot({ path: marketPath });
    appendFileSync(
      SHOT_LOG,
      `${JSON.stringify({
        sha,
        name: 'market',
        path: marketPath,
        url: page.url(),
        viewport: { width, height },
        gapPx: market,
        time: new Date().toISOString(),
      })}\n`
    );
  });
}
