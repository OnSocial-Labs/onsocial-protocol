import { expect, test, type Page } from '@playwright/test';
import { gotoApp } from './helpers';
import {
  NOTIFICATIONS_E2E_ACCOUNT,
  seedAuthenticatedNotifications,
} from './helpers/notifications-auth';

/**
 * Notifications list windowing — the activity inbox shares the feed-window
 * core with the feed and thread panels: past the row threshold (30), far
 * rows collapse into spacer divs and rematerialize on scroll back. One
 * stubbed inbox page of 40 same-day mentions crosses it.
 */

const ROW_COUNT = 40;

function mentionRow(index: number) {
  const id = `win-note-${String(index).padStart(2, '0')}`;
  return {
    id,
    recipient: NOTIFICATIONS_E2E_ACCOUNT,
    actor: `${id}.testnet`,
    type: 'mention',
    dedupeKey: id,
    read: true,
    source: {
      contract: null,
      receiptId: null,
      blockHeight: null,
    },
    context: {
      snippet: `Window note ${String(index).padStart(2, '0')}`,
      path: `${id}.testnet/post/1`,
    },
    // Newest first, minutes apart — one day header in any timezone run.
    createdAt: new Date(Date.now() - index * 60_000).toISOString(),
  };
}

async function stubWindowedInbox(page: Page): Promise<void> {
  await page.route('**/api/onapi/developer/notifications**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/count')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipient: NOTIFICATIONS_E2E_ACCOUNT,
          unread: 0,
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/push/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: false,
          enabled: false,
          subscriptionCount: 0,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        notifications: Array.from({ length: ROW_COUNT }, (_, index) =>
          mentionRow(index)
        ),
        nextCursor: null,
      }),
    });
  });
}

function scrollInboxTo(page: Page, position: 'top' | 'bottom') {
  return page
    .locator('.os-app-screen-body')
    .first()
    .evaluate((node, at) => {
      node.scrollTop = at === 'bottom' ? node.scrollHeight : 0;
    }, position);
}

/** Rendered activity rows (day rules are separate — only items counted). */
async function renderedRowCount(page: Page): Promise<number> {
  return page.locator('.notifications-activity-row').count();
}

test.describe('notifications list windowing', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedNotifications(page);
  });

  test('far rows collapse to spacers and rematerialize on scroll back', async ({
    page,
  }) => {
    await stubWindowedInbox(page);
    await gotoApp(page, '/notifications');

    const list = page.locator('.notifications-activity-list');
    await expect(list).toContainText('Window note 00', { timeout: 30_000 });

    // 40 rows cross the threshold — once the window engages, rows away
    // from the viewport collapse into a bottom spacer.
    await expect
      .poll(() => renderedRowCount(page), { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      0
    );

    // Deep scroll — the tail row materializes, head rows collapse. The first
    // pass can land mid-list as spacers settle, so scroll twice.
    await scrollInboxTo(page, 'bottom');
    await expect(list).toContainText('Window note 39', { timeout: 15_000 });
    await scrollInboxTo(page, 'bottom');
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );
    await expect
      .poll(() => renderedRowCount(page), { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);

    // Scroll back — the head row rematerializes with its content.
    await scrollInboxTo(page, 'top');
    await expect(list).toContainText('Window note 00', { timeout: 10_000 });
    await expect
      .poll(() => renderedRowCount(page), { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
  });
});
