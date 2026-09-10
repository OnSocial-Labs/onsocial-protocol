import { expect, test, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import {
  NOTIFICATIONS_E2E_ACCOUNT,
  seedAuthenticatedNotifications,
} from './helpers/notifications-auth';

const firstNotification = {
  id: 'notification-first',
  recipient: NOTIFICATIONS_E2E_ACCOUNT,
  actor: null,
  type: 'app_event',
  dedupeKey: 'first',
  read: false,
  source: {
    contract: null,
    receiptId: null,
    blockHeight: null,
  },
  context: { text: 'First update' },
  createdAt: '2026-09-10T09:00:00.000Z',
};

const refreshedNotification = {
  ...firstNotification,
  id: 'notification-refreshed',
  dedupeKey: 'refreshed',
  context: { text: 'Refreshed update' },
  createdAt: '2026-09-10T09:05:00.000Z',
};

const earlierNotification = {
  ...firstNotification,
  id: 'notification-earlier',
  dedupeKey: 'earlier',
  context: { text: 'Earlier update' },
  createdAt: '2026-09-10T08:00:00.000Z',
};

type StubOptions = {
  delayInitial?: boolean;
  delayRefresh?: boolean;
  delayAppend?: boolean;
  failInitial?: boolean;
  failAppend?: boolean;
};

async function stubNotifications(
  page: Page,
  options: StubOptions = {}
): Promise<{
  releaseInitial: () => void;
  releaseRefresh: () => void;
  releaseAppend: () => void;
  setUnread: (count: number) => void;
  listCalls: () => number;
}> {
  let unread = 0;
  let listCallCount = 0;
  let appendFailures = options.failAppend ? 1 : 0;
  let releaseInitial!: () => void;
  let releaseRefresh!: () => void;
  let releaseAppend!: () => void;
  const initialGate = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const appendGate = new Promise<void>((resolve) => {
    releaseAppend = resolve;
  });

  await page.route('**/api/onapi/developer/notifications**', async (route) => {
    const url = new URL(route.request().url());
    // #region agent log
    appendFileSync(
      '/opt/cursor/logs/debug.log',
      `${JSON.stringify({
        hypothesisId: 'C',
        location: 'notifications-loading.spec.ts:77',
        message: 'Notifications proxy interception observed',
        data: {
          path: url.pathname,
          cursor: url.searchParams.get('cursor'),
          delayInitial: Boolean(options.delayInitial),
          hasAuthorization: Boolean(
            route.request().headers().authorization
          ),
        },
        timestamp: Date.now(),
      })}\n`
    );
    // #endregion
    if (url.pathname.endsWith('/count')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipient: NOTIFICATIONS_E2E_ACCOUNT,
          unread,
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
    if (url.pathname.endsWith('/read')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: 1 }),
      });
      return;
    }

    const cursor = url.searchParams.get('cursor');
    if (cursor) {
      if (appendFailures > 0) {
        appendFailures -= 1;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Notifications unavailable' }),
        });
        return;
      }
      if (options.delayAppend) await appendGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [earlierNotification],
          nextCursor: null,
        }),
      });
      return;
    }

    listCallCount += 1;
    if (listCallCount === 1) {
      // #region agent log
      appendFileSync(
        '/opt/cursor/logs/debug.log',
        `${JSON.stringify({
          hypothesisId: 'E',
          location: 'notifications-loading.spec.ts:141',
          message: 'Initial notification route reached gate',
          data: { delayInitial: Boolean(options.delayInitial) },
          timestamp: Date.now(),
        })}\n`
      );
      // #endregion
      if (options.delayInitial) await initialGate;
      if (options.failInitial) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Notifications unavailable' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [firstNotification],
          nextCursor: 'cursor-earlier',
        }),
      });
      return;
    }

    if (options.delayRefresh) await refreshGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        notifications: [refreshedNotification],
        nextCursor: 'cursor-earlier',
      }),
    });
  });

  return {
    releaseInitial,
    releaseRefresh,
    releaseAppend,
    setUnread: (count) => {
      unread = count;
    },
    listCalls: () => listCallCount,
  };
}

async function expectAuthenticatedActivity(page: Page): Promise<void> {
  await expect(page.getByText('Activity', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('First update', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('authenticated notifications loading', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedNotifications(page);
  });

  test('keeps the cold skeleton until the authenticated activity fetch settles', async ({
    page,
  }) => {
    const stub = await stubNotifications(page, { delayInitial: true });
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });

    await expect(
      page.locator('.notifications-activity-list.standing-list-skeleton')
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('.notifications-activity-row')
    ).toHaveCount(0);
    await expect(
      page.locator('.notifications-activity-row--skeleton')
    ).toHaveCount(6);

    stub.releaseInitial();
    await expectAuthenticatedActivity(page);
    await expect(
      page.locator('.notifications-activity-list.standing-list-skeleton')
    ).toHaveCount(0);
  });

  test('preserves painted activity while a soft unread refresh is pending', async ({
    page,
  }) => {
    const stub = await stubNotifications(page, { delayRefresh: true });
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expectAuthenticatedActivity(page);

    stub.setUnread(1);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(stub.listCalls, { timeout: 15_000 }).toBe(2);
    await expect(page.getByText('First update', { exact: true })).toBeVisible();
    await expect(
      page.locator('.notifications-activity-list--refreshing')
    ).toHaveAttribute('aria-busy', 'true');
    await expect(
      page.locator('.notifications-activity-row--skeleton')
    ).toHaveCount(0);

    stub.releaseRefresh();
    await expect(page.getByText('Refreshed update', { exact: true })).toBeVisible();
    await expect(
      page.locator('.notifications-activity-list--refreshing')
    ).toHaveCount(0);
  });

  test('adds append skeletons without replacing painted activity', async ({
    page,
  }) => {
    const stub = await stubNotifications(page, { delayAppend: true });
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expectAuthenticatedActivity(page);

    await page.getByRole('button', { name: 'Load earlier' }).click();
    await expect(page.getByText('First update', { exact: true })).toBeVisible();
    await expect(
      page.locator('[data-notifications-append-skeleton]')
    ).toBeVisible();
    await expect(
      page.locator('.notifications-activity-row--skeleton')
    ).toHaveCount(2);

    stub.releaseAppend();
    await expect(page.getByText('Earlier update', { exact: true })).toBeVisible();
  });

  test('shows append errors over painted activity and retries pagination', async ({
    page,
  }) => {
    await stubNotifications(page, { failAppend: true });
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expectAuthenticatedActivity(page);

    await page.getByRole('button', { name: 'Load earlier' }).click();
    const appendError = page
      .getByRole('alert')
      .filter({ hasText: 'Notifications unavailable' });
    await expect(appendError).toBeVisible();
    await expect(page.getByText('First update', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Try again' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Earlier update', { exact: true })).toBeVisible();
    await expect(appendError).toHaveCount(0);
  });
});
