import { expect, test, type Page } from '@playwright/test';
import { gotoApp } from './helpers';

const TOTAL = 120;
const PAGE = 24;

function directoryAccountId(index: number): string {
  return `dir-${String(index).padStart(3, '0')}.testnet`;
}

function directoryProfile(index: number) {
  const id = String(index).padStart(3, '0');
  return {
    accountId: directoryAccountId(index),
    name: `Directory ${id}`,
    bio: `Row ${id} in the windowed directory stub.`,
    avatarUrl: null,
    kind: 'person',
    industry: null,
    offerCount: 0,
    openJobsCount: 0,
    faceLine: null,
    standingCount: 3,
    standingWithCount: 1,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    moodId: 'protocol',
    viewerStanding: false,
    theyStandWithViewer: false,
    targetEndorsedViewer: false,
    viewerEndorsed: false,
  };
}

/** Offset-paged directory stub: five 24-row pages, then hasMore=false. */
async function stubDirectory(page: Page): Promise<number[]> {
  const servedOffsets: number[] = [];
  await page.route('**/api/discover?*', async (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') ?? '0');
    servedOffsets.push(offset);
    const profiles = Array.from(
      { length: Math.max(0, Math.min(PAGE, TOTAL - offset)) },
      (_, i) => directoryProfile(offset + i)
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: '',
        face: 'all',
        industry: '',
        craft: '',
        limit: PAGE,
        offset,
        hasMore: offset + PAGE < TOTAL,
        profiles,
      }),
    });
  });
  return servedOffsets;
}

const slotRows = (page: Page) =>
  page.locator('.discover-profiles-list-slot [data-standing-key]');
const slotRow = (page: Page, index: number) =>
  page.locator(
    `.discover-profiles-list-slot [data-standing-key="${directoryAccountId(index)}"]`
  );

test.describe('discover directory windowing', () => {
  test('pages through the sentinel while the DOM stays bounded', async ({
    page,
  }) => {
    const servedOffsets = await stubDirectory(page);
    await gotoApp(page, '/discover?tab=profiles');

    const firstRow = slotRow(page, 0);
    await expect(firstRow).toBeVisible({ timeout: 30_000 });

    // First page is under the windowing threshold — everything renders.
    await expect(slotRows(page)).toHaveCount(PAGE);
    await expect(
      page.locator('.discover-profiles-list-slot [data-feed-window-spacer]')
    ).toHaveCount(0);

    // Walk the sentinel: each trip to the current bottom appends a page.
    const scroller = page.locator('.os-app-screen-body');
    for (let i = 0; i < 14 && !servedOffsets.includes(TOTAL - PAGE); i += 1) {
      await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await page.waitForTimeout(700);
    }
    expect(servedOffsets).toContain(TOTAL - PAGE);

    // The last append grew the list after the final scroll — catch up.
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

    // At the tail: the last row materializes, the head is collapsed.
    const lastRow = slotRow(page, TOTAL - 1);
    await expect(lastRow).toBeVisible();
    await expect(
      page.locator(
        '.discover-profiles-list-slot [data-feed-window-spacer="top"]'
      )
    ).toBeAttached();
    await expect(slotRow(page, 0)).toHaveCount(0);
    const renderedAtTail = await slotRows(page).count();
    expect(renderedAtTail).toBeLessThan(TOTAL);

    // Back at the top: the head rematerializes, the tail collapses.
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(firstRow).toBeVisible();
    await expect(slotRow(page, TOTAL - 1)).toHaveCount(0);
    const renderedAtTop = await slotRows(page).count();
    expect(renderedAtTop).toBeLessThan(TOTAL);
  });
});
