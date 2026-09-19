import { expect, test, type Page } from '@playwright/test';
import {
  NOTIFICATIONS_E2E_ACCOUNT,
  seedAuthenticatedNotifications,
} from './helpers/notifications-auth';

const mentionNotification = {
  id: 'notification-mention',
  recipient: NOTIFICATIONS_E2E_ACCOUNT,
  actor: 'bob.testnet',
  type: 'mention',
  dedupeKey: 'mention-hunt',
  read: false,
  source: {
    contract: null,
    receiptId: null,
    blockHeight: null,
  },
  context: {
    snippet: 'post hunt @alice.testnet #near',
    path: 'bob.testnet/post/3',
  },
  createdAt: '2026-09-10T09:00:00.000Z',
};

const likeNotification = {
  id: 'notification-like',
  recipient: NOTIFICATIONS_E2E_ACCOUNT,
  actor: 'cara.testnet',
  type: 'reaction',
  dedupeKey: 'like-hunt',
  read: true,
  source: {
    contract: null,
    receiptId: null,
    blockHeight: null,
  },
  context: {
    reactionValue: JSON.stringify({ type: 'like' }),
    snippet: 'post hunt',
    path: `${NOTIFICATIONS_E2E_ACCOUNT}/post/9`,
  },
  createdAt: '2026-09-10T08:30:00.000Z',
};

async function stubSnippetNotifications(page: Page): Promise<void> {
  await page.route('**/api/onapi/developer/notifications**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/count')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipient: NOTIFICATIONS_E2E_ACCOUNT,
          unread: 1,
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
        notifications: [mentionNotification, likeNotification],
        nextCursor: null,
      }),
    });
  });
}

function fontStackHasDmSans(fontFamily: string): boolean {
  return /dm sans/i.test(fontFamily);
}

test.describe('activity post snippets', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedNotifications(page);
  });

  test('shows like and mention quotes in DM Sans without nested links', async ({
    page,
  }) => {
    await stubSnippetNotifications(page);
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });

    const mentionSnippet = page
      .locator('.notifications-activity-snippet')
      .filter({ hasText: 'post hunt' })
      .first();
    await expect(mentionSnippet).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('mentioned you', { exact: true })).toBeVisible();
    await expect(page.getByText('liked your post', { exact: true })).toBeVisible();

    const mention = mentionSnippet.locator('.os-mention');
    await expect(mention).toHaveText('@alice.testnet');
    await expect(mention).toHaveCount(1);
    expect(await mention.evaluate((node) => node.tagName)).toBe('SPAN');

    const hashtag = mentionSnippet.locator('.os-hashtag');
    await expect(hashtag).toHaveText('#near');
    expect(await hashtag.evaluate((node) => node.tagName)).toBe('SPAN');

    const snippetFont = await mentionSnippet.evaluate(
      (node) => getComputedStyle(node).fontFamily
    );
    const mentionFont = await mention.evaluate(
      (node) => getComputedStyle(node).fontFamily
    );
    expect(fontStackHasDmSans(snippetFont)).toBe(true);
    expect(fontStackHasDmSans(mentionFont)).toBe(true);
  });
});
