import { expect, test, type Page } from '@playwright/test';
import {
  NOTIFICATIONS_E2E_ACCOUNT,
  seedAuthenticatedNotifications,
} from './helpers/notifications-auth';

const appEventNotification = {
  id: 'notification-app-event',
  recipient: NOTIFICATIONS_E2E_ACCOUNT,
  actor: null,
  type: 'app_event',
  dedupeKey: 'app-event',
  read: false,
  source: {
    contract: null,
    receiptId: null,
    blockHeight: null,
  },
  context: { text: 'First update' },
  createdAt: '2026-09-10T09:00:00.000Z',
};

const mentionNotification = {
  ...appEventNotification,
  id: 'notification-mention',
  actor: 'carol.testnet',
  type: 'mention',
  dedupeKey: 'mention',
  context: { text: 'Mention body' },
  createdAt: '2026-09-10T08:30:00.000Z',
};

async function stubNotificationsWithTabs(page: Page): Promise<{
  listTypeParams: () => Array<string | null>;
  readBodies: () => Array<{
    all?: boolean;
    type?: string;
    excludeType?: string;
  }>;
}> {
  const seenTypes: Array<string | null> = [];
  const reads: Array<{ all?: boolean; type?: string; excludeType?: string }> =
    [];

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
    if (url.pathname.endsWith('/read')) {
      reads.push(
        route.request().postDataJSON() as {
          all?: boolean;
          type?: string;
          excludeType?: string;
        }
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: 1 }),
      });
      return;
    }

    seenTypes.push(url.searchParams.get('type'));
    if (url.searchParams.get('type') === 'mention,reply') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [mentionNotification],
          nextCursor: null,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        notifications: [appEventNotification, mentionNotification],
        nextCursor: null,
      }),
    });
  });

  return {
    listTypeParams: () => seenTypes,
    readBodies: () => reads,
  };
}

/** Tall All list + short Mentions list, so scroll lines are meaningful. */
async function stubTallNotificationsWithTabs(page: Page): Promise<void> {
  const tall = Array.from({ length: 40 }, (_, index) => ({
    ...appEventNotification,
    id: `notification-tall-${index}`,
    dedupeKey: `tall-${index}`,
    context: { text: `Update ${index + 1}` },
    createdAt: new Date(
      Date.parse('2026-09-10T09:00:00.000Z') - index * 60_000
    ).toISOString(),
  }));

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
    if (url.pathname.endsWith('/read')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: 1 }),
      });
      return;
    }

    const mentionsOnly = url.searchParams.get('type') === 'mention,reply';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        notifications: mentionsOnly ? [mentionNotification] : tall,
        nextCursor: null,
      }),
    });
  });
}

test.describe('activity inbox tabs', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedNotifications(page);
  });

  test('switches between All and Mentions with a scoped type filter', async ({
    page,
  }) => {
    const stub = await stubNotificationsWithTabs(page);
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });

    const allTab = page.getByRole('tab', { name: 'All', exact: true });
    const mentionsTab = page.getByRole('tab', { name: 'Mentions' });
    await expect(allTab).toBeVisible({ timeout: 30_000 });
    await expect(allTab).toHaveAttribute('aria-selected', 'true');
    await expect(mentionsTab).toHaveAttribute('aria-selected', 'false');

    // All tab paints every kind.
    await expect(page.getByText('First update', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('mentioned you')).toBeVisible();

    // Mentions is fetched in the background before the first tap.
    await expect
      .poll(() => stub.listTypeParams().includes('mention,reply'), {
        timeout: 15_000,
      })
      .toBe(true);

    await mentionsTab.click();
    await expect(mentionsTab).toHaveAttribute('aria-selected', 'true');
    await expect(allTab).toHaveAttribute('aria-selected', 'false');

    // Mentions fetch carries the multi-type include filter.
    await expect
      .poll(() => stub.listTypeParams().includes('mention,reply'), {
        timeout: 15_000,
      })
      .toBe(true);
    await expect(page.getByText('mentioned you')).toBeVisible();
    await expect(page.getByText('First update', { exact: true })).toHaveCount(
      0
    );

    // Back-switch paints cached rows instantly, then soft-refreshes.
    const callsBeforeBack = stub.listTypeParams().length;
    await allTab.click();
    await expect(page.getByText('First update', { exact: true })).toBeVisible();
    await expect(page.getByText('mentioned you')).toBeVisible();
    await expect
      .poll(() => stub.listTypeParams().length, { timeout: 15_000 })
      .toBeGreaterThan(callsBeforeBack);
    // All refetch is untyped. The Mentions prefetch may follow it.
    expect(stub.listTypeParams().slice(callsBeforeBack)).toContain(null);
  });

  test('filters with arrow keys from the tablist', async ({ page }) => {
    await stubNotificationsWithTabs(page);
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('First update', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const allTab = page.getByRole('tab', { name: 'All', exact: true });
    const mentionsTab = page.getByRole('tab', { name: 'Mentions' });
    await allTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(mentionsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('mentioned you')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(allTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('First update', { exact: true })).toBeVisible();
  });

  test('slides the active-pill thumb under the selected tab', async ({
    page,
  }) => {
    await stubNotificationsWithTabs(page);
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('First update', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const allTab = page.getByRole('tab', { name: 'All', exact: true });
    const mentionsTab = page.getByRole('tab', { name: 'Mentions' });
    const thumb = page.locator('.notifications-activity-tabs-thumb');
    await expect(thumb).toBeAttached();

    const thumbLeft = () =>
      thumb.evaluate((el) =>
        Number(
          (el as HTMLElement).style.transform.match(
            /translate3d\((-?\d+(?:\.\d+)?)px/
          )?.[1]
        )
      );
    const tabLeft = (locator: typeof allTab) =>
      locator.evaluate((el) => (el as HTMLElement).offsetLeft);
    // Sample both in the same tick — flex tab offsets flap by a pixel while
    // the chrome settles, so fixed expected values race the ResizeObserver.
    const thumbDelta = async (locator: typeof allTab) =>
      Math.abs((await thumbLeft()) - (await tabLeft(locator)));

    await expect.poll(() => thumbDelta(allTab)).toBeLessThanOrEqual(1);
    await mentionsTab.click();
    await expect.poll(() => thumbDelta(mentionsTab)).toBeLessThanOrEqual(1);
    await allTab.click();
    await expect.poll(() => thumbDelta(allTab)).toBeLessThanOrEqual(1);
  });

  test('remembers each tab’s scroll line when switching', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubTallNotificationsWithTabs(page);
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Update 1', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const scroller = page.locator('.os-app-screen-body').first();
    const scrollTop = () => scroller.evaluate((node) => node.scrollTop);
    await scroller.evaluate((node) => {
      node.scrollTop = 800;
    });
    await expect.poll(scrollTop).toBeGreaterThan(700);

    const allTab = page.getByRole('tab', { name: 'All', exact: true });
    const mentionsTab = page.getByRole('tab', { name: 'Mentions' });

    // Mentions is a short list — the line clamps to the top.
    await mentionsTab.click();
    await expect(page.getByText('mentioned you')).toBeVisible();
    await expect.poll(scrollTop).toBeLessThan(50);

    // Back on All the saved line lands again after the cached paint.
    await allTab.click();
    await expect(page.getByText('mentioned you')).toHaveCount(0);
    await expect.poll(scrollTop, { timeout: 15_000 }).toBeGreaterThan(700);

    // And Mentions kept its own (top) line, not All's scrolled one.
    await mentionsTab.click();
    await expect(page.getByText('mentioned you')).toBeVisible();
    await expect.poll(scrollTop).toBeLessThan(50);
  });

  test('marks read only for the open tab', async ({ page }) => {
    const stub = await stubNotificationsWithTabs(page);
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('mentioned you')).toBeVisible({
      timeout: 30_000,
    });

    const markAll = page.getByRole('button', { name: 'Mark all read' });
    await page.getByRole('tab', { name: 'Mentions' }).click();
    await expect(markAll).toBeVisible();
    await markAll.click();
    await expect.poll(() => stub.readBodies().length).toBe(1);
    expect(stub.readBodies()[0]).toMatchObject({
      all: true,
      type: 'mention,reply',
    });
    expect(stub.readBodies()[0]?.excludeType).toContain('dm');
    expect(page.locator('.notifications-activity-pip')).toHaveCount(0);

    await page.getByRole('tab', { name: 'All', exact: true }).click();
    await expect(page.getByText('First update', { exact: true })).toBeVisible();
    await expect(markAll).toBeVisible();
    await markAll.click();
    await expect.poll(() => stub.readBodies().length).toBe(2);
    expect(stub.readBodies()[1]?.all).toBe(true);
    expect(stub.readBodies()[1]?.type).toBeUndefined();
    expect(stub.readBodies()[1]?.excludeType).toContain('dm');
  });

  test('shows the mentions unread count on the chip', async ({ page }) => {
    await seedAuthenticatedNotifications(page);
    await page.route(
      '**/api/onapi/developer/notifications**',
      async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/count')) {
          const mentions = url.searchParams.get('type') === 'mention,reply';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              recipient: NOTIFICATIONS_E2E_ACCOUNT,
              unread: mentions ? 4 : 6,
            }),
          });
          return;
        }
        if (
          url.pathname.endsWith('/push/status') ||
          url.pathname.endsWith('/read')
        ) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              url.pathname.endsWith('/read')
                ? { updated: 1 }
                : { configured: false, enabled: false, subscriptionCount: 0 }
            ),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            notifications: [appEventNotification],
            nextCursor: null,
          }),
        });
      }
    );

    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    const mentions = page.getByRole('tab', { name: 'Mentions' });
    await expect(mentions).toBeVisible({ timeout: 30_000 });
    await expect(mentions).toContainText('4');
    await expect(
      page.getByRole('tab', { name: 'All', exact: true })
    ).not.toContainText('4');
  });

  test('folds repeated likes of one post into a single row', async ({
    page,
  }) => {
    await seedAuthenticatedNotifications(page);
    const like = (id: string, actor: string, createdAt: string) => ({
      ...appEventNotification,
      id,
      actor,
      type: 'reaction',
      dedupeKey: id,
      context: {
        reactionTargetPath: 'alice.testnet/post/9',
        reactionValue: JSON.stringify({ type: 'like' }),
      },
      createdAt,
    });

    await page.route(
      '**/api/onapi/developer/notifications**',
      async (route) => {
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
        if (
          url.pathname.endsWith('/push/status') ||
          url.pathname.endsWith('/read')
        ) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ updated: 1 }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            notifications: [
              like('like-1', 'carol.testnet', '2026-09-10T09:00:00.000Z'),
              mentionNotification,
              like('like-2', 'dave.testnet', '2026-09-10T08:00:00.000Z'),
              like('like-3', 'erin.testnet', '2026-09-10T07:00:00.000Z'),
            ],
            nextCursor: null,
          }),
        });
      }
    );

    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('and 2 others liked your post')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('liked your post')).toHaveCount(1);
    await expect(page.getByText('mentioned you')).toBeVisible();
  });
});
