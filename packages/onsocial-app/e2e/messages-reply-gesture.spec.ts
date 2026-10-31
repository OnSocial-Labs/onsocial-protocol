import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  MESSAGES_E2E_PEER,
  MESSAGES_E2E_PUBLIC_KEY,
  MESSAGES_E2E_THREAD,
  sealE2eDmBody,
  seedAuthenticatedMessages,
} from './helpers/messages-auth';
import { NOTIFICATIONS_E2E_ACCOUNT } from './helpers/notifications-auth';

const MESSAGE_COUNT = 80;
const ORIGIN = 'Origin line';
const NEAR = 'Near line';
const LATEST = 'Latest line';
const rowKey = (index: number) => `msg-${String(index).padStart(3, '0')}`;

const threadSummary = {
  threadId: MESSAGES_E2E_THREAD,
  peerAccountId: MESSAGES_E2E_PEER,
  lastMessageAt: '2026-09-10T13:59:00.000Z',
  lastMessageId: rowKey(MESSAGE_COUNT - 1),
  unread: true,
};

function bodyFor(index: number): string {
  if (index === 0) return ORIGIN;
  if (index === MESSAGE_COUNT - 2) return NEAR;
  if (index === MESSAGE_COUNT - 1) return LATEST;
  return `Line ${index}`;
}

const threadMessages = Array.from({ length: MESSAGE_COUNT }, (_, index) => {
  const id = rowKey(index);
  const sealed = sealE2eDmBody(
    bodyFor(index),
    index === MESSAGE_COUNT - 1 ? rowKey(0) : undefined
  );
  return {
    id,
    threadId: MESSAGES_E2E_THREAD,
    senderAccountId: NOTIFICATIONS_E2E_ACCOUNT,
    recipientAccountId: MESSAGES_E2E_PEER,
    createdAt: new Date(
      Date.parse('2026-09-10T12:00:00.000Z') + index * 60_000
    ).toISOString(),
    media: null,
    ...sealed,
  };
});

async function stubReadableThread(page: Page): Promise<void> {
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

async function openThread(page: Page): Promise<void> {
  await seedAuthenticatedMessages(page);
  await stubReadableThread(page);
  await page.goto(
    `/messages?thread=${encodeURIComponent(MESSAGES_E2E_THREAD)}`,
    {
      waitUntil: 'domcontentloaded',
    }
  );
  await expect(
    page.getByLabel('Thread').getByText(LATEST, { exact: true })
  ).toBeVisible({ timeout: 30_000 });
}

async function swipeReply(row: Locator): Promise<void> {
  await row.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const startX = rect.left + 28;
    const y = rect.top + rect.height / 2;
    const pointer = {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
    };
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...pointer,
        clientX: startX,
        clientY: y,
      })
    );
    el.dispatchEvent(
      new PointerEvent('pointermove', {
        ...pointer,
        clientX: startX + 64,
        clientY: y,
      })
    );
    el.dispatchEvent(
      new PointerEvent('pointerup', {
        ...pointer,
        clientX: startX + 64,
        clientY: y,
      })
    );
  });
}

test.describe('DM reply gesture', () => {
  test('pointer reply is a named hover target and focuses the composer', async ({
    page,
  }) => {
    await openThread(page);
    const near = page.locator(
      `[data-dm-row-key="${rowKey(MESSAGE_COUNT - 2)}"]`
    );
    await expect(near).toBeVisible();
    const reply = near.getByRole('button', { name: `Reply to “${NEAR}”` });
    // Opacity 0 stays in the accessibility tree. Assert the paint, not visibility.
    await expect(reply).toHaveCSS('opacity', '0');
    await near.hover();
    await expect(reply).toHaveCSS('opacity', '1');
    await expect(reply).toBeVisible();
    const box = await reply.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.width).toBeGreaterThanOrEqual(40);
    await reply.click();
    await expect(page.locator('.os-write-dock-reply-name')).toHaveText(NEAR);
    await expect(page.locator('.os-write-dock-input')).toBeFocused();
  });

  test('a rightward touch swipe replies without a permanent label', async ({
    page,
  }) => {
    await openThread(page);
    const latest = page.locator(
      `[data-dm-row-key="${rowKey(MESSAGE_COUNT - 1)}"]`
    );
    const reply = latest.getByRole('button', {
      name: `Reply to “${LATEST}”`,
    });
    await expect(reply).toHaveCSS('opacity', '0');
    await swipeReply(latest);
    await expect(page.locator('.os-write-dock-reply-name')).toHaveText(LATEST);
    await expect(page.locator('.os-write-dock-input')).toBeFocused();
  });

  test('a quote jumps to the original message and flashes it', async ({
    page,
  }) => {
    await openThread(page);
    const origin = page.locator(`[data-dm-row-key="${rowKey(0)}"]`);
    await expect(origin).toHaveCount(0);
    await page
      .getByRole('button', { name: `Show your message, ${ORIGIN}` })
      .click();
    await expect(origin).toBeVisible();
    await expect(origin.locator('.messages-bubble')).toHaveClass(
      /is-quote-flash/
    );
    await expect(origin.getByText(ORIGIN, { exact: true })).toBeVisible();
  });
});
