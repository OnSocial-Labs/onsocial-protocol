import { appendFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  MESSAGES_E2E_PEER,
  MESSAGES_E2E_PUBLIC_KEY,
  MESSAGES_E2E_THREAD,
  seedAuthenticatedMessages,
} from './helpers/messages-auth';
import { NOTIFICATIONS_E2E_ACCOUNT } from './helpers/notifications-auth';

const firstThread = {
  threadId: MESSAGES_E2E_THREAD,
  peerAccountId: MESSAGES_E2E_PEER,
  lastMessageAt: '2026-09-10T09:00:00.000Z',
  lastMessageId: 'message-first',
  unread: true,
};

const refreshedThread = {
  ...firstThread,
  lastMessageAt: '2026-09-10T09:05:00.000Z',
  lastMessageId: 'message-refreshed',
  unread: false,
};

const firstMessage = {
  id: 'message-first',
  threadId: MESSAGES_E2E_THREAD,
  senderAccountId: NOTIFICATIONS_E2E_ACCOUNT,
  recipientAccountId: MESSAGES_E2E_PEER,
  createdAt: '2026-09-10T09:00:00.000Z',
  ciphertext: 'e2e-ciphertext',
  nonce: 'e2e-nonce',
  senderCiphertext: null,
  senderNonce: null,
  media: null,
  senderPubkey: MESSAGES_E2E_PUBLIC_KEY,
  ephemeralPubkey: null,
  authTag: null,
};

const earlierMessage = {
  ...firstMessage,
  id: 'message-earlier',
  createdAt: '2026-09-10T08:00:00.000Z',
};

function writeMessagesDebugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
): void {
  appendFileSync(
    '/opt/cursor/logs/debug.log',
    `${JSON.stringify({
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    })}\n`
  );
}

type StubOptions = {
  delayThreads?: boolean;
  delayAppend?: boolean;
  failAppend?: boolean;
};

async function stubMessages(
  page: Page,
  options: StubOptions = {}
): Promise<{
  releaseThreads: () => void;
  releaseAppend: () => void;
  threadCalls: () => number;
}> {
  let threadCallCount = 0;
  let appendFailures = options.failAppend ? 1 : 0;
  let releaseThreads!: () => void;
  let releaseAppend!: () => void;
  const threadGate = new Promise<void>((resolve) => {
    releaseThreads = resolve;
  });
  const appendGate = new Promise<void>((resolve) => {
    releaseAppend = resolve;
  });

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
      threadCallCount += 1;
      if (
        options.delayThreads &&
        (threadCallCount === 1 || threadCallCount === 2)
      ) {
        await threadGate;
      }
      // #region agent log
      writeMessagesDebugLog(
        'A,B',
        'e2e/messages-loading.spec.ts:174',
        'thread list stub response',
        {
          call: threadCallCount,
          threadCount: 1,
          peerAccountIdPresent: Boolean(
            (threadCallCount > 1 ? refreshedThread : firstThread).peerAccountId
          ),
          threadShapeValid: Boolean(
            (threadCallCount > 1 ? refreshedThread : firstThread).threadId &&
              (threadCallCount > 1 ? refreshedThread : firstThread).lastMessageAt
          ),
        }
      );
      // #endregion
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          threads: [threadCallCount > 1 ? refreshedThread : firstThread],
        }),
      });
      return;
    }
    if (path.includes('/developer/dm/threads/')) {
      const beforeMessageId = url.searchParams.get('beforeMessageId');
      if (beforeMessageId) {
        if (appendFailures > 0) {
          appendFailures -= 1;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Messages unavailable' }),
          });
          return;
        }
        if (options.delayAppend) await appendGate;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            messages: [earlierMessage],
            hasMore: false,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [firstMessage],
          hasMore: true,
        }),
      });
      return;
    }

    await route.continue();
  });

  return {
    releaseThreads,
    releaseAppend,
    threadCalls: () => threadCallCount,
  };
}

async function expectInboxPainted(page: Page): Promise<void> {
  const bodyText = await page.locator('body').innerText();
  const inboxRows = await page.locator('.messages-inbox-row').allTextContents();
  const exactPeerTextCount = await page
    .getByText(MESSAGES_E2E_PEER, { exact: true })
    .count();
  const profileNameTextCount = await page.getByText('Bob', { exact: true }).count();
  // #region agent log
  writeMessagesDebugLog(
    'A,B,C',
    'e2e/messages-loading.spec.ts:242',
    'inbox paint assertion DOM state',
    {
      exactPeerTextCount,
      profileNameTextCount,
      bodyHasPeerAccount: bodyText.includes(MESSAGES_E2E_PEER),
      inboxRowCount: inboxRows.length,
      inboxRowHasPeerAccount: inboxRows.some((text) =>
        text.includes(MESSAGES_E2E_PEER)
      ),
      skeletonCount: await page
        .locator('.messages-inbox-row--skeleton')
        .count(),
      refreshingListCount: await page
        .locator('.messages-inbox-list--refreshing')
        .count(),
      errorCount: await page.getByRole('alert').count(),
    }
  );
  // #endregion
  await expect(page.getByText('Bob', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('authenticated messages loading', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedMessages(page);
  });

  test('keeps the cold inbox skeleton until authenticated threads settle', async ({
    page,
  }) => {
    const stub = await stubMessages(page, { delayThreads: true });
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });

    await expect(
      page.locator('.messages-inbox-list--skeleton')
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('.messages-inbox-row--skeleton')
    ).toHaveCount(6);

    stub.releaseThreads();
    await expectInboxPainted(page);
    await expect(
      page.locator('.messages-inbox-list--skeleton')
    ).toHaveCount(0);
  });

  test('preserves the painted inbox during a soft refresh', async ({ page }) => {
    const stub = await stubMessages(page);
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await expectInboxPainted(page);

    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(stub.threadCalls, { timeout: 15_000 }).toBe(2);
    await expectInboxPainted(page);
    await expect(
      page.locator('.messages-inbox-list--refreshing')
    ).toHaveAttribute('aria-busy', 'true');
    await expect(
      page.locator('.messages-inbox-row--skeleton')
    ).toHaveCount(0);
  });

  test('appends message skeletons without replacing the painted thread', async ({
    page,
  }) => {
    const stub = await stubMessages(page, { delayAppend: true });
    await page.goto(`/messages?thread=${encodeURIComponent(MESSAGES_E2E_THREAD)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('button', { name: 'Earlier' })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Earlier' }).click();
    await expect(
      page.locator('[data-messages-append-skeleton]')
    ).toBeVisible();
    await expect(
      page.locator('.messages-bubble--skeleton')
    ).toHaveCount(2);

    stub.releaseAppend();
    await expect(page.locator('.messages-bubble--skeleton')).toHaveCount(0);
  });

  test('shows an append error over the painted thread and retries', async ({
    page,
  }) => {
    await stubMessages(page, { failAppend: true });
    await page.goto(`/messages?thread=${encodeURIComponent(MESSAGES_E2E_THREAD)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('button', { name: 'Earlier' })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Earlier' }).click();
    await expect(
      page.getByText('Messages unavailable', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Earlier')).toBeVisible();

    await page.getByRole('button', { name: 'Earlier' }).click();
    await expect(page.locator('.messages-bubble--skeleton')).toHaveCount(0);
  });
});
