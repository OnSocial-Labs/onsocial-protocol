import { expect, test, type Page } from '@playwright/test';
import {
  MESSAGES_E2E_PEER,
  MESSAGES_E2E_PUBLIC_KEY,
  MESSAGES_E2E_THREAD,
  seedAuthenticatedMessages,
} from './helpers/messages-auth';
import { NOTIFICATIONS_E2E_ACCOUNT } from './helpers/notifications-auth';

const MESSAGE_COUNT = 120;
const rowKey = (index: number) => `msg-${String(index).padStart(3, '0')}`;

const threadSummary = {
  threadId: MESSAGES_E2E_THREAD,
  peerAccountId: MESSAGES_E2E_PEER,
  lastMessageAt: '2026-09-10T13:59:00.000Z',
  lastMessageId: rowKey(MESSAGE_COUNT - 1),
  unread: true,
};

const threadMessages = Array.from({ length: MESSAGE_COUNT }, (_, index) => ({
  id: rowKey(index),
  threadId: MESSAGES_E2E_THREAD,
  senderAccountId:
    index % 2 === 0 ? MESSAGES_E2E_PEER : NOTIFICATIONS_E2E_ACCOUNT,
  recipientAccountId:
    index % 2 === 0 ? NOTIFICATIONS_E2E_ACCOUNT : MESSAGES_E2E_PEER,
  createdAt: new Date(
    Date.parse('2026-09-10T12:00:00.000Z') + index * 60_000
  ).toISOString(),
  ciphertext: 'e2e-ciphertext',
  nonce: 'e2e-nonce',
  senderCiphertext: null,
  senderNonce: null,
  media: null,
  senderPubkey: MESSAGES_E2E_PUBLIC_KEY,
  ephemeralPubkey: null,
  authTag: null,
}));

async function stubLongThread(page: Page): Promise<void> {
  await page.route('**/api/onapi/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
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
        body: JSON.stringify({ threads: [threadSummary] }),
      });
      return;
    }
    if (path.includes('/developer/dm/threads/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: threadMessages,
          hasMore: false,
        }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe('DM thread windowing', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedMessages(page);
    await stubLongThread(page);
    await page.goto(
      `/messages?thread=${encodeURIComponent(MESSAGES_E2E_THREAD)}`,
      { waitUntil: 'domcontentloaded' }
    );
  });

  test('opens pinned to the latest bubble with a bounded DOM', async ({
    page,
  }) => {
    const latest = page.locator(
      `[data-dm-row-key="${rowKey(MESSAGE_COUNT - 1)}"]`
    );
    await expect(latest).toBeVisible({ timeout: 30_000 });

    // Windowing engaged: a top spacer stands in for the collapsed history.
    await expect(
      page.locator('[data-feed-window-spacer="top"]')
    ).toBeAttached();
    const rendered = await page.locator('[data-dm-row-key]').count();
    expect(rendered).toBeLessThan(MESSAGE_COUNT);
    await expect(
      page.locator(`[data-dm-row-key="${rowKey(0)}"]`)
    ).toHaveCount(0);
  });

  test('scrolls up into history and back without growing the DOM', async ({
    page,
  }) => {
    const latest = page.locator(
      `[data-dm-row-key="${rowKey(MESSAGE_COUNT - 1)}"]`
    );
    await expect(latest).toBeVisible({ timeout: 30_000 });

    const scroller = page.locator('.os-app-screen-body');
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(
      page.locator(`[data-dm-row-key="${rowKey(0)}"]`)
    ).toBeVisible();
    await expect(latest).toHaveCount(0);
    const renderedAtTop = await page.locator('[data-dm-row-key]').count();
    expect(renderedAtTop).toBeLessThan(MESSAGE_COUNT);

    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(latest).toBeVisible();
    const renderedAtBottom = await page.locator('[data-dm-row-key]').count();
    expect(renderedAtBottom).toBeLessThan(MESSAGE_COUNT);
  });
});
