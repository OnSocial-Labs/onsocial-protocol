import { writeFile } from 'node:fs/promises';
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

const anniversaryNotification = {
  id: 'notification-anniversary',
  recipient: NOTIFICATIONS_E2E_ACCOUNT,
  actor: null,
  type: 'profile_anniversary',
  dedupeKey: 'anniversary-1',
  read: true,
  source: {
    contract: null,
    receiptId: null,
    blockHeight: null,
  },
  context: {
    years: 1,
    accountId: NOTIFICATIONS_E2E_ACCOUNT,
  },
  createdAt: '2026-09-10T08:00:00.000Z',
};

const standNotification = {
  id: 'notification-stand',
  recipient: NOTIFICATIONS_E2E_ACCOUNT,
  actor: 'drew.testnet',
  type: 'standing_new',
  dedupeKey: 'stand-1',
  read: true,
  source: {
    contract: null,
    receiptId: null,
    blockHeight: null,
  },
  context: {},
  createdAt: '2026-09-10T08:15:00.000Z',
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
        notifications: [
          mentionNotification,
          likeNotification,
          standNotification,
          anniversaryNotification,
        ],
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
    await expect(page.getByText('1 year on OnSocial', { exact: true })).toBeVisible();
    await expect(page.getByText('stood with you', { exact: true })).toBeVisible();

    const likeRow = page
      .locator('.notifications-activity-row')
      .filter({ hasText: 'liked your post' });
    const mentionRow = page
      .locator('.notifications-activity-row')
      .filter({ hasText: 'mentioned you' });
    const standRow = page
      .locator('.notifications-activity-row')
      .filter({ hasText: 'stood with you' });
    const anniversaryRow = page
      .locator('.notifications-activity-row')
      .filter({ hasText: '1 year on OnSocial' });
    const likeBadge = likeRow.locator('[data-activity-badge="like"]');
    const mentionBadge = mentionRow.locator('[data-activity-badge="mention"]');
    const standBadge = standRow.locator('[data-activity-badge="stand"]');
    const anniversaryBadge = anniversaryRow.locator(
      '[data-activity-badge="anniversary"]'
    );
    await expect(likeBadge).toBeVisible();
    await expect(mentionBadge).toBeVisible();
    await expect(standBadge).toBeVisible();
    await expect(anniversaryBadge).toBeVisible();

    const badgeFills = await Promise.all(
      [likeBadge, mentionBadge, standBadge, anniversaryBadge].map((badge) =>
        badge.evaluate((node) => {
          const style = getComputedStyle(node);
          const wrap = node.closest('.standing-row-avatar-badge');
          const wrapStyle = wrap ? getComputedStyle(wrap) : null;
          return {
            className: node.className,
            inline: node.getAttribute('style'),
            background: style.backgroundColor,
            wrapBackground: wrapStyle?.backgroundColor ?? '',
            color: style.color,
          };
        })
      )
    );
    for (const fill of badgeFills) {
      const painted = [fill.background, fill.wrapBackground].some(
        (value) =>
          Boolean(value) &&
          value !== 'transparent' &&
          !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(value)
      );
      expect(painted, JSON.stringify(fill)).toBe(true);
    }
    await expect(
      anniversaryRow.locator('.notifications-activity-mark--onsocial')
    ).toHaveCount(0);
    await expect(likeRow.getByText('liked your post', { exact: true })).toBeVisible();

    const dayHeader = page.locator('.notifications-activity-day').first();
    await expect(dayHeader).toBeVisible();
    const dayLabel = ((await dayHeader.textContent()) ?? '').trim();
    expect(dayLabel.length).toBeGreaterThan(0);
    const timePattern = /^Today$/i.test(dayLabel)
      ? /^(now|\d+m|\d+h)$/
      : /\d{1,2}:\d{2}/;
    for (const row of [mentionRow, likeRow, standRow, anniversaryRow]) {
      const stamp = row.locator('.standing-row-time');
      await expect(stamp).toHaveText(timePattern);
      await expect(stamp).not.toHaveText(/ago|Sep \d+/);
    }

    const mention = mentionSnippet.locator('.os-mention');
    await expect(mention).toHaveText('@alice.testnet');
    await expect(mention).toHaveCount(1);
    expect(await mention.evaluate((node) => node.tagName)).toBe('SPAN');

    const hashtag = mentionSnippet.locator('.os-hashtag');
    await expect(hashtag).toHaveText('#near');
    expect(await hashtag.evaluate((node) => node.tagName)).toBe('SPAN');

    const snippetStyles = await mentionSnippet.evaluate((node) => {
      const mentionNode = node.querySelector('.os-mention');
      const hashtagNode = node.querySelector('.os-hashtag');
      const snippet = getComputedStyle(node);
      const mentionStyle = mentionNode ? getComputedStyle(mentionNode) : null;
      const hashtagStyle = hashtagNode ? getComputedStyle(hashtagNode) : null;
      return {
        snippetFont: snippet.fontFamily,
        snippetWeight: snippet.fontWeight,
        mentionFont: mentionStyle?.fontFamily ?? '',
        mentionWeight: mentionStyle?.fontWeight ?? '',
        mentionColor: mentionStyle?.color ?? '',
        hashtagFont: hashtagStyle?.fontFamily ?? '',
        hashtagColor: hashtagStyle?.color ?? '',
        mentionTag: mentionNode?.tagName ?? '',
      };
    });
    expect(fontStackHasDmSans(snippetStyles.snippetFont)).toBe(true);
    expect(fontStackHasDmSans(snippetStyles.mentionFont)).toBe(true);
    expect(fontStackHasDmSans(snippetStyles.hashtagFont)).toBe(true);
    expect(snippetStyles.mentionWeight).toBe('300');
    expect(snippetStyles.mentionTag).toBe('SPAN');

    const artifactDir = process.env.E2E_ARTIFACTS;
    if (artifactDir) {
      await writeFile(
        `${artifactDir}/activity_snippet_computed_styles.json`,
        `${JSON.stringify({ snippetStyles, badgeFills, dayLabel }, null, 2)}\n`
      );
      const list = page.locator('.notifications-activity-list');
      await list.screenshot({
        path: `${artifactDir}/activity_post_snippets_dm_sans.png`,
      });
      await page.screenshot({
        path: `${artifactDir}/activity_page_dm_sans.png`,
        fullPage: true,
      });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.locator('html').evaluate((node) => {
        node.setAttribute('data-theme', 'dark');
      });
      await list.screenshot({
        path: `${artifactDir}/activity_type_discs_dark.png`,
      });
      await page.emulateMedia({ colorScheme: 'light' });
      await page.locator('html').evaluate((node) => {
        node.setAttribute('data-theme', 'light');
      });
      await list.screenshot({
        path: `${artifactDir}/activity_type_discs_light.png`,
      });
    }
  });
});
