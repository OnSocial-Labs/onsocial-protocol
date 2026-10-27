import { expect, test, type Page } from '@playwright/test';
import {
  MESSAGES_E2E_PUBLIC_KEY,
  seedAuthenticatedMessages,
} from './helpers/messages-auth';
import { NOTIFICATIONS_E2E_ACCOUNT } from './helpers/notifications-auth';

/**
 * DM inbox windowing — the conversation list shares the feed-window core
 * with the feed, thread panels, and notifications: past the row threshold
 * (30), far rows collapse into spacer divs and rematerialize on scroll back.
 * The gateway list is cursor-less, so one stubbed inbox of 44 threads
 * crosses it.
 */

const THREAD_COUNT = 44;
const peerId = (index: number) =>
  `peer${String(index).padStart(2, '0')}.testnet`;
const threadId = (index: number) =>
  `${NOTIFICATIONS_E2E_ACCOUNT}::${peerId(index)}`;

// Newest first, minutes apart — peer00 at the head, peer43 at the tail.
const inboxThreads = Array.from({ length: THREAD_COUNT }, (_, index) => ({
  threadId: threadId(index),
  peerAccountId: peerId(index),
  lastMessageAt: new Date(Date.now() - index * 60_000).toISOString(),
  lastMessageId: `m-${index}`,
  unread: false,
}));

async function stubWindowedInbox(page: Page): Promise<void> {
  await page.route('**/api/onapi/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/data/get-one')) {
      const key = url.searchParams.get('key');
      if (key === 'profile/messaging_wrap') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            value: JSON.stringify({
              v: 1,
              publicKey: MESSAGES_E2E_PUBLIC_KEY,
              ciphertext: 'e2e-wrapped-secret',
              nonce: 'e2e-wrap-nonce',
            }),
          }),
        });
        return;
      }
      if (key === 'profile/messaging_pubkey') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ value: MESSAGES_E2E_PUBLIC_KEY }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ value: null }),
      });
      return;
    }

    if (path.endsWith('/notifications/count')) {
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
    if (path.endsWith('/notifications/push/status')) {
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
    if (path.endsWith('/dm/unread-count')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unread: 0 }),
      });
      return;
    }
    if (path.endsWith('/dm/read')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: 1 }),
      });
      return;
    }
    if (path.endsWith('/developer/dm/threads')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ threads: inboxThreads }),
      });
      return;
    }
    if (path.includes('/developer/dm/threads/')) {
      // Per-thread preview fetch — an empty page keeps previews blank.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: [], hasMore: false }),
      });
      return;
    }

    await route.continue();
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

test.describe('DM inbox windowing', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedMessages(page);
    await stubWindowedInbox(page);
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
  });

  test('far rows collapse to spacers and rematerialize on scroll back', async ({
    page,
  }) => {
    const list = page.locator('.messages-inbox-list').first();
    const row = (index: number) =>
      list.locator(`[data-inbox-thread-key="${threadId(index)}"]`);
    const renderedRowCount = () =>
      list.locator('[data-inbox-thread-key]').count();

    await expect(row(0)).toBeVisible({ timeout: 30_000 });

    // 44 threads cross the threshold — once the window engages, rows away
    // from the viewport collapse into a bottom spacer.
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(THREAD_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      0
    );

    // Deep scroll — the tail thread materializes, head rows collapse. The
    // first pass can land mid-list as spacers settle, so scroll twice.
    await scrollInboxTo(page, 'bottom');
    await expect(row(THREAD_COUNT - 1)).toBeVisible({ timeout: 15_000 });
    await scrollInboxTo(page, 'bottom');
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(THREAD_COUNT);
    await expect(row(0)).toHaveCount(0);

    // Scroll back — the head thread rematerializes.
    await scrollInboxTo(page, 'top');
    await expect(row(0)).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(THREAD_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
  });
});
