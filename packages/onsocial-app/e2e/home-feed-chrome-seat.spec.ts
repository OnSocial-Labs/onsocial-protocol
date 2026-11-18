import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

type GraphBody = {
  query?: string;
};

function feedRow(index: number) {
  return {
    accountId: 'alice.near',
    postId: `seat-${index}`,
    value: JSON.stringify({ v: 1, text: `Seat ${index}` }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: `receipt-seat-${index}`,
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: 'post',
    audiences: '',
    groupId: '',
    isGroupContent: false,
    authorName: 'Alice',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

function graphField(query: string): 'postsFeed' | 'postsCurrent' | null {
  if (query.includes('postsFeed')) return 'postsFeed';
  if (query.includes('postsCurrent')) return 'postsCurrent';
  return null;
}

async function stubHomePage(page: Page) {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const field = graphField(body.query ?? '');
    if (!field) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          [field]: Array.from({ length: 24 }, (_, index) => feedRow(index)),
        },
      }),
    });
  });
}

async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await stubHomePage(page);
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  await expect(page.locator('.home-feed-block').first()).toBeVisible();
}

test.describe('Home feed chrome seats', () => {
  test('keeps block document positions when the rail tucks', async ({
    page,
  }) => {
    await openHome(page, 390, 844);
    const read = () =>
      page.evaluate(() => {
        const root = document.querySelector('.os-app-screen-body');
        if (!(root instanceof HTMLElement)) return [];
        return [...document.querySelectorAll('.home-feed-block')]
          .slice(0, 4)
          .map((el) =>
            Math.round(el.getBoundingClientRect().top + root.scrollTop)
          );
      });
    const before = await read();
    expect(before.length).toBeGreaterThan(0);
    await page.evaluate(() => {
      document
        .querySelector('.home-feed-compact-chrome')
        ?.classList.add('is-scroll-hidden');
    });
    expect(await read()).toEqual(before);
  });

  test('keeps the load-more footer height when the in-flight dots mount', async ({
    page,
  }) => {
    await openHome(page, 1280, 800);
    await expect(page.locator('.home-feed-load-more')).toBeVisible();
    const measured = await page.evaluate(() => {
      const node = document.querySelector('.home-feed-load-more');
      if (!(node instanceof HTMLElement)) return null;
      const resting = Math.round(node.getBoundingClientRect().height);
      node.querySelectorAll('.list-append-pending').forEach((row) => row.remove());
      const row = document.createElement('div');
      row.className = 'list-append-pending';
      const dots = document.createElement('span');
      dots.className = 'protocol-pulsing-dots protocol-pulsing-dots--sm';
      for (let i = 0; i < 3; i += 1) {
        const dot = document.createElement('span');
        dot.className = 'protocol-pulsing-dots__dot';
        dots.appendChild(dot);
      }
      row.appendChild(dots);
      node.appendChild(row);
      return {
        resting,
        next: Math.round(node.getBoundingClientRect().height),
      };
    });
    expect(measured).not.toBeNull();
    expect(measured?.resting).toBeGreaterThan(1);
    expect(measured?.next).toBe(measured?.resting);
  });
});
