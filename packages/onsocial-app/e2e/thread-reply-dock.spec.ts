import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import {
  expectE2eSignerWrite,
  extractPreparedAction,
  seedE2eMockSigner,
  stubE2eComposePrepare,
} from './helpers/e2e-mock-signer';

type GraphBody = {
  query?: string;
  variables?: { offset?: number };
};

function feedRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  parentAuthor?: string;
  parentPath?: string;
  authorName?: string;
}) {
  return {
    accountId: opts.accountId,
    postId: opts.postId,
    value: JSON.stringify({ v: 1, text: opts.text }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: `receipt-${opts.postId}`,
    parentPath: opts.parentPath ?? '',
    parentAuthor: opts.parentAuthor ?? '',
    parentType: opts.parentPath ? 'post' : '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: 'post',
    audiences: '',
    groupId: '',
    isGroupContent: false,
    authorName: opts.authorName ?? 'Alice',
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

/** Reply row shape returned by the `RepliesByPath` threadReplies query. */
function replyRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  parentAuthor: string;
  parentPath: string;
}) {
  return {
    replyAuthor: opts.accountId,
    replyId: opts.postId,
    value: JSON.stringify({ v: 1, text: opts.text }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    groupId: '',
    parentAuthor: opts.parentAuthor,
    parentPath: opts.parentPath,
    parentType: 'post',
  };
}

const ROOT = {
  accountId: 'alice.near',
  postId: 'root-post',
  text: 'Root post',
  authorName: 'Alice',
};
const REPLY_ONE = {
  accountId: 'bob.near',
  postId: 'reply-one',
  text: 'First reply from Bob',
  parentAuthor: 'alice.near',
  parentPath: 'alice.near/post/root-post',
  authorName: 'Bob',
};
const REPLY_TWO = {
  accountId: 'cara.near',
  postId: 'reply-two',
  text: 'Second reply from Cara',
  parentAuthor: 'alice.near',
  parentPath: 'alice.near/post/root-post',
  authorName: 'Cara',
};

/** Feed shows the root post; the root path returns both replies. */
async function stubThreadGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    const field = graphField(query);

    // Feed list — root post only.
    if (field) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [feedRow(ROOT)] } }),
      });
      return;
    }

    // Thread tree — replies under the root. The tree is built recursively:
    // the root path returns both replies, each reply's own path returns none.
    if (query.includes('threadReplies')) {
      const parentPath =
        (
          route.request().postDataJSON() as GraphBody & {
            variables?: { parentPath?: string };
          }
        ).variables?.parentPath ?? '';
      const replies =
        parentPath === 'alice.near/post/root-post'
          ? [
              replyRow({
                accountId: REPLY_ONE.accountId,
                postId: REPLY_ONE.postId,
                text: REPLY_ONE.text,
                parentAuthor: REPLY_ONE.parentAuthor,
                parentPath: REPLY_ONE.parentPath,
              }),
              replyRow({
                accountId: REPLY_TWO.accountId,
                postId: REPLY_TWO.postId,
                text: REPLY_TWO.text,
                parentAuthor: REPLY_TWO.parentAuthor,
                parentPath: REPLY_TWO.parentPath,
              }),
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { threadReplies: replies } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}

/** The chain-confirmation poll answers FINAL so the reply paints optimistically. */
async function stubNearRpcFinal(page: Page): Promise<void> {
  await page.route('**/api/near/rpc', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'e2e',
        result: {
          final_execution_status: 'FINAL',
          status: { SuccessValue: '' },
          receipts_outcome: [],
        },
      }),
    });
  });
}

async function openThreadDrawer(page: Page) {
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);

  // Signed-in viewers land on Pulse; the stub feeds Global.
  const globalTab = page.getByRole('tab', { name: 'Global' });
  if ((await globalTab.count()) > 0) {
    await globalTab.click();
  }

  const feed = page.locator('.home-feed-list');
  await expect(feed).toContainText('Root post');

  // Open the thread drawer from the post link (Open post / timestamp).
  await feed.getByRole('link', { name: 'Open post' }).first().click();

  // The drawer shows the seeded root immediately, then loads replies.
  const drawer = page.locator('.post-thread-sheet-panel');
  await expect(drawer).toBeVisible({ timeout: 15_000 });
  await expect(drawer).toContainText('Root post');
  await expect(drawer).toContainText('First reply from Bob', {
    timeout: 15_000,
  });
  await expect(drawer).toContainText('Second reply from Cara');
  return drawer;
}

/**
 * Open the thread drawer from a feed post, then Reply inside the drawer points
 * the write dock at that reply (chip + focus) without losing the feed behind it.
 */
test.describe('thread reply dock', () => {
  test('drawer opens with replies, reply Reply focuses dock with chip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubThreadGraph(page);

    const drawer = await openThreadDrawer(page);

    // Click Reply on Bob's reply inside the drawer.
    await drawer
      .getByRole('button', { name: 'Reply to this post' })
      .nth(1)
      .click();

    // The write dock points at Bob with the reply chip and is focused.
    const chip = page.locator('.os-write-dock-reply');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('Replying');
    await expect(chip).toContainText('Bob');

    // The reply target is the nested reply, not the root.
    await expect(
      page.locator('[data-thread-opened-post="root-post"]')
    ).toBeVisible();

    // Cancelling the chip returns the dock to the root target.
    await page.getByRole('button', { name: 'Cancel reply' }).click();
    await expect(page.locator('.os-write-dock-reply')).toHaveCount(0);
  });

  test('dock reply send records the write and paints the optimistic reply', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eMockSigner(page, 'dave.near', { succeed: true });
    await stubE2eComposePrepare(page);
    await stubNearRpcFinal(page);
    await stubThreadGraph(page);

    const drawer = await openThreadDrawer(page);

    // In an open thread the dock replies to the root by default — the reply
    // chip only appears once a nested reply is picked (covered above).
    const field = page.getByRole('textbox', { name: 'Add a reply…' });
    await field.fill('Dock reply from the thread');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    // The wallet recorded one batched set for the reply under the root.
    await expectE2eSignerWrite(page, (recorded) => {
      const prepared = recorded.map(extractPreparedAction);
      expect(recorded.some((call) => call.methodName === 'execute')).toBe(true);
      expect(prepared.some((action) => action?.e2eVerb === 'set')).toBe(true);
      const blob = JSON.stringify(recorded);
      expect(blob).toContain('alice.near/post/root-post');
      expect(blob).toContain('Dock reply from the thread');
    });

    // Confirmed — the optimistic reply paints in the open thread, dock resets.
    await expect(drawer).toContainText('Dock reply from the thread', {
      timeout: 15_000,
    });
    await expect(page.locator('.os-write-dock-reply')).toHaveCount(0);
    await expect(field).toHaveValue('');
  });

  test('nested reply send parents the write under the picked reply', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eMockSigner(page, 'dave.near', { succeed: true });
    await stubE2eComposePrepare(page);
    await stubNearRpcFinal(page);
    await stubThreadGraph(page);

    const drawer = await openThreadDrawer(page);

    // Pick Bob's reply — the chip names the nested target.
    await drawer
      .getByRole('button', { name: 'Reply to this post' })
      .nth(1)
      .click();
    const chip = page.locator('.os-write-dock-reply');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('Bob');

    const field = page.getByRole('textbox', { name: 'Add a reply…' });
    await field.fill('Nested dock reply');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    // The write parents under Bob's reply, not the root.
    await expectE2eSignerWrite(page, (recorded) => {
      const blob = JSON.stringify(recorded);
      expect(blob).toContain('bob.near/post/reply-one');
      expect(blob).toContain('Nested dock reply');
      expect(blob).not.toContain('alice.near/post/root-post');
    });

    // Confirmed — chip and field reset. A nested reply waits for the indexer
    // reconcile instead of painting optimistically.
    await expect(page.locator('.os-write-dock-reply')).toHaveCount(0);
    await expect(field).toHaveValue('');
    await expect(drawer.getByText('Nested dock reply')).toHaveCount(0);
  });
});

/**
 * Media-face trail — photo enlarge → reply drawer → tap a reply. The post
 * layer opened above the keep-dock face resolves to z 170 (overShell 90 +
 * the glass media-face lift), past the dock's constant face bands (90/95):
 * the reply dock ended up under the sheet and reply taps only scrolled.
 * The layer host publishes the sheet's resolved z + 1 as --os-thread-dock-z
 * so the dock rides one above the live sheet.
 */
test.describe('thread reply dock over the media face', () => {
  const CDN = 'https://cdn.testnet.onsocial.id';
  const CID_JPEG =
    'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
  const VARIANT_SVG =
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
    `<rect width="8" height="8" fill="#36c"/></svg>`;

  const PHOTO_ROOT = {
    accountId: 'alice.near',
    postId: 'root-post',
    text: 'Root photo post',
  };
  const FACE_REPLY = {
    accountId: 'bob.near',
    postId: 'reply-one',
    text: 'First reply from Bob',
    parentPath: 'alice.near/post/root-post',
  };
  const NESTED_REPLY = {
    accountId: 'cara.near',
    postId: 'reply-two',
    text: 'Nested reply from Cara',
    parentPath: 'bob.near/post/reply-one',
  };

  async function stubMediaThreadGraph(page: Page): Promise<void> {
    await page.route('**/api/onapi/graph/query', async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const query = body.query ?? '';
      const field = graphField(query);
      if (field) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              [field]: [
                {
                  ...feedRow({
                    accountId: PHOTO_ROOT.accountId,
                    postId: PHOTO_ROOT.postId,
                    text: PHOTO_ROOT.text,
                  }),
                  value: JSON.stringify({
                    v: 1,
                    text: PHOTO_ROOT.text,
                    media: [
                      { cid: CID_JPEG, mime: 'image/jpeg', size: 200_000 },
                    ],
                  }),
                },
              ],
            },
          }),
        });
        return;
      }
      if (query.includes('threadReplies')) {
        const parentPath =
          (
            route.request().postDataJSON() as GraphBody & {
              variables?: { parentPath?: string };
            }
          ).variables?.parentPath ?? '';
        const rows =
          parentPath === FACE_REPLY.parentPath
            ? [
                replyRow({
                  accountId: FACE_REPLY.accountId,
                  postId: FACE_REPLY.postId,
                  text: FACE_REPLY.text,
                  parentAuthor: PHOTO_ROOT.accountId,
                  parentPath: FACE_REPLY.parentPath,
                }),
              ]
            : parentPath === NESTED_REPLY.parentPath
              ? [
                  replyRow({
                    accountId: NESTED_REPLY.accountId,
                    postId: NESTED_REPLY.postId,
                    text: NESTED_REPLY.text,
                    parentAuthor: FACE_REPLY.accountId,
                    parentPath: NESTED_REPLY.parentPath,
                  }),
                ]
              : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { threadReplies: rows } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    });
  }

  async function stubMediaCdn(page: Page): Promise<void> {
    await page.route(`${CDN}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: VARIANT_SVG,
      });
    });
  }

  test('post layer over the media face keeps the reply dock on top', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubMediaThreadGraph(page);
    await stubMediaCdn(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) {
      await globalTab.click();
    }
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText(PHOTO_ROOT.text);

    // Open the photo enlarge face, then Reply — the in-face thread drawer.
    await feed.locator('.post-media-tile').first().click();
    const face = page.locator('[data-os-slide-over="true"]').first();
    await expect(face).toBeVisible({ timeout: 10_000 });
    await face
      .getByRole('button', { name: 'Reply to this post' })
      .first()
      .click();
    const drawer = page.locator('.feed-photo-thread-sheet');
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect(drawer).toContainText(FACE_REPLY.text, { timeout: 15_000 });

    // Tap Bob's reply in the drawer — the post layer opens above the face.
    await drawer.getByRole('link', { name: 'Open post' }).first().click();
    const layer = page.locator('.post-thread-sheet-panel');
    await expect(layer).toBeVisible({ timeout: 10_000 });
    await expect(layer).toContainText(NESTED_REPLY.text, { timeout: 15_000 });

    // The dock rides above the face-lifted sheet, not under it.
    const z = await page.evaluate(() => {
      const dock = document.querySelector('.portfolio-summon-dock');
      const sheet = document.querySelector(
        '.glass-sheet-root:has(.post-thread-sheet-panel)'
      );
      if (!dock || !sheet) return null;
      return {
        dock: Number(getComputedStyle(dock).zIndex),
        sheet: Number(getComputedStyle(sheet).zIndex),
      };
    });
    expect(z).not.toBeNull();
    expect(z!.dock).toBeGreaterThan(z!.sheet);

    // Reply on Cara's nested reply — chip names her and the field types.
    await layer
      .getByRole('button', { name: 'Reply to this post' })
      .nth(1)
      .click();
    const chip = page.locator('.os-write-dock-reply');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('Cara');
    const field = page.getByRole('textbox', { name: 'Add a reply…' });
    await field.fill('Reply from the trail layer');
    await expect(field).toHaveValue('Reply from the trail layer');

    // Closing the layer hands the dock back to the face drawer band.
    await layer.getByRole('button', { name: 'Back' }).first().click();
    await expect(layer).toHaveCount(0, { timeout: 8_000 });
    await expect(drawer).toBeVisible();
    const restored = await page.evaluate(() => {
      const dock = document.querySelector('.portfolio-summon-dock');
      return dock ? Number(getComputedStyle(dock).zIndex) : null;
    });
    expect(restored).toBeLessThan(170);
  });
});
