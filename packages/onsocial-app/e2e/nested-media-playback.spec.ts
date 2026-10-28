import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * A clip that is already playing must stay one player when a reply drawer
 * opens, the same clip is scrolled into view, and it is clicked. A second
 * copy must continue the clock. Muted autoplay must not cut off audible
 * audio, and a second audible element of the same file must not start
 * beside the first.
 */

const CLIP_URL = 'https://media.example/nested-clip.webm';
const TONE_URL = 'https://media.example/nested-tone.webm';
const CLIP = readFileSync(path.join(__dirname, 'fixtures/nested-clip.webm'));
const TONE = readFileSync(path.join(__dirname, 'fixtures/nested-tone.webm'));

const VIDEO_ROOT = 'alice.near/post/video-root';

type Place = 'feed' | 'sheet' | 'face' | 'parked';

type Playing = {
  tag: string;
  time: number;
  muted: boolean;
  place: Place;
};

function postRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  parentPath?: string;
  parentAuthor?: string;
  video?: boolean;
  blockHeight: number;
}) {
  return {
    accountId: opts.accountId,
    postId: opts.postId,
    value: JSON.stringify({
      v: 1,
      text: opts.text,
      ...(opts.video
        ? {
            media: [
              {
                cid: CLIP_URL,
                mime: 'video/webm',
                width: 320,
                height: 180,
              },
            ],
          }
        : {}),
    }),
    blockHeight: opts.blockHeight,
    blockTimestamp: 1_700_000_000_000,
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
    authorName: 'Alice',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

const videoRoot = postRow({
  accountId: 'alice.near',
  postId: 'video-root',
  text: 'Clip already playing',
  video: true,
  blockHeight: 100,
});

const spacers = Array.from({ length: 8 }, (_, index) =>
  postRow({
    accountId: 'bob.near',
    postId: `spacer-${index}`,
    text: `Spacer reply ${index}`,
    parentPath: VIDEO_ROOT,
    parentAuthor: 'alice.near',
    blockHeight: 110 + index,
  })
);

const nestedClip = postRow({
  accountId: 'carol.near',
  postId: 'nested-clip',
  text: 'Same clip in the replies',
  parentPath: VIDEO_ROOT,
  parentAuthor: 'alice.near',
  video: true,
  blockHeight: 130,
});

const deepReply = postRow({
  accountId: 'dave.near',
  postId: 'deep-reply',
  text: 'Deep reply under the clip',
  parentPath: VIDEO_ROOT,
  parentAuthor: 'alice.near',
  blockHeight: 140,
});

const posts = [videoRoot, ...spacers, nestedClip, deepReply];

function replyShape(row: (typeof posts)[number]) {
  return {
    replyAuthor: row.accountId,
    replyId: row.postId,
    value: row.value,
    blockHeight: row.blockHeight,
    blockTimestamp: row.blockTimestamp,
    groupId: '',
    parentAuthor: row.parentAuthor,
    parentPath: row.parentPath,
    parentType: 'post',
  };
}

function fulfillBytes(
  route: Route,
  body: Buffer,
  contentType: string
): Promise<void> {
  const range = route.request().headers().range;
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = Number(match?.[1] ?? 0);
    const end = match?.[2] ? Number(match[2]) : body.length - 1;
    const slice = body.subarray(start, end + 1);
    return route.fulfill({
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
        'Content-Length': String(slice.length),
      },
      body: slice,
    });
  }
  return route.fulfill({
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'Content-Length': String(body.length),
    },
    body,
  });
}

async function stubClipThread(page: Page): Promise<void> {
  await page.route('https://media.example/**', async (route) => {
    const url = route.request().url();
    if (url.includes('nested-tone.webm')) {
      await fulfillBytes(route, TONE, 'audio/webm');
      return;
    }
    await fulfillBytes(route, CLIP, 'video/webm');
  });

  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
      variables?: { postId?: string; parentPath?: string };
    };
    const query = body.query ?? '';

    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      const postId = body.variables?.postId;
      const rows = postId
        ? posts.filter((row) => row.postId === postId)
        : [videoRoot];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: rows } }),
      });
      return;
    }

    if (query.includes('threadReplies')) {
      const parentPath = body.variables?.parentPath ?? '';
      const replies =
        parentPath === VIDEO_ROOT
          ? [...spacers, nestedClip, deepReply].map(replyShape)
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { threadReplies: replies } }),
      });
      return;
    }

    if (query.includes('QuotesByPath')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { quotes: [] } }),
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

function visibleSheet(page: Page) {
  return page.locator(
    '.glass-sheet-root:not(.post-thread-sheet-parked) .post-thread-sheet-panel'
  );
}

async function playingMedia(page: Page): Promise<Playing[]> {
  return page.evaluate(() => {
    const rows: Playing[] = [];
    document.querySelectorAll('video, audio').forEach((node) => {
      if (!(node instanceof HTMLMediaElement)) return;
      if (node.paused || node.ended) return;
      let place: Place = 'feed';
      if (node.closest('.post-thread-sheet-parked')) place = 'parked';
      else if (node.closest('.feed-photo-video-wrap')) place = 'face';
      else if (node.closest('.glass-sheet-root')) place = 'sheet';
      rows.push({
        tag: node.tagName.toLowerCase(),
        time: node.currentTime,
        muted: node.muted,
        place,
      });
    });
    return rows;
  });
}

/** One audible or visible player, still past the start of the clip. */
async function expectContinued(
  page: Page,
  place: Place,
  minTime: number
): Promise<number> {
  let time = 0;
  await expect
    .poll(
      async () => {
        const playing = await playingMedia(page);
        if (playing.length !== 1) return `count:${playing.length}`;
        const [only] = playing;
        if (!only || only.place !== place) return `place:${only?.place}`;
        time = only.time;
        if (only.time < minTime) return `time:${only.time.toFixed(2)}`;
        return 'ok';
      },
      { timeout: 15_000 }
    )
    .toBe('ok');
  return time;
}

test.describe('nested reply media playback', () => {
  test('a playing clip is not started again from a nested reply', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await stubClipThread(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) await globalTab.click();

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Clip already playing', {
      timeout: 20_000,
    });

    const started = await expectContinued(page, 'feed', 0.45);
    // The stretched open-hit sits under the video, so a center click hits
    // the clip. The caption passes through to the hit.
    const caption = feed.getByText('Clip already playing');
    const captionBox = await caption.boundingBox();
    if (!captionBox) throw new Error('clip caption missing');
    await page.mouse.click(
      captionBox.x + Math.min(24, captionBox.width / 2),
      captionBox.y + captionBox.height / 2
    );

    const sheet = visibleSheet(page);
    await expect(sheet).toContainText('Clip already playing', {
      timeout: 15_000,
    });
    await expect(sheet).toContainText('Same clip in the replies', {
      timeout: 15_000,
    });
    const inThread = await expectContinued(
      page,
      'sheet',
      Math.max(0.35, started - 0.2)
    );

    const nested = sheet.locator('.post-thread-item', {
      hasText: 'Same clip in the replies',
    });
    await nested.scrollIntoViewIfNeeded();
    // The reply mounts the same file. It must stay quiet while the open
    // post's copy is the one already playing.
    const stillThread = await expectContinued(
      page,
      'sheet',
      Math.max(0.35, inThread - 0.25)
    );
    const nestedVideo = nested.locator('video');
    await expect
      .poll(
        async () =>
          nestedVideo.evaluate(
            (node) => node instanceof HTMLVideoElement && node.paused
          ),
        {
          timeout: 5_000,
        }
      )
      .toBe(true);

    await nested.locator('.post-media-tile').click();
    await expect(page.locator('.feed-photo-video')).toBeVisible({
      timeout: 10_000,
    });
    await expectContinued(page, 'face', Math.max(0.35, stillThread - 0.3));

    await page
      .getByRole('button', { name: /Back from media|Close photo/ })
      .click();
    await expect(page.locator('.feed-photo-video')).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(sheet).toContainText('Deep reply under the clip');

    const deep = sheet.locator('.post-thread-item', {
      hasText: 'Deep reply under the clip',
    });
    await deep.scrollIntoViewIfNeeded();
    const deepCaption = deep.getByText('Deep reply under the clip');
    const deepBox = await deepCaption.boundingBox();
    if (!deepBox) throw new Error('deep reply missing');
    await page.mouse.click(deepBox.x + 8, deepBox.y + deepBox.height / 2);

    const nestedSheet = visibleSheet(page);
    await expect(nestedSheet).toContainText('Deep reply under the clip', {
      timeout: 15_000,
    });
    await expect(nestedSheet).toContainText('Clip already playing', {
      timeout: 15_000,
    });
    const ancestor = nestedSheet.locator('.guild-thread-ancestor', {
      hasText: 'Clip already playing',
    });
    await ancestor.scrollIntoViewIfNeeded();
    const handed = await expectContinued(
      page,
      'sheet',
      Math.max(0.35, stillThread - 0.35)
    );

    await ancestor.locator('.post-media-tile').click();
    await expect(page.locator('.feed-photo-video')).toBeVisible({
      timeout: 10_000,
    });
    await expectContinued(page, 'face', Math.max(0.35, handed - 0.35));
  });

  test('audible audio is not restarted or cut off by a silent copy', async ({
    page,
  }) => {
    await stubClipThread(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await page.locator('body').click({ position: { x: 8, y: 8 } });

    const result = await page.evaluate(
      async ({ tone, clip }) => {
        const waitUntil = (node: HTMLMediaElement, min: number) =>
          new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(
              () => reject(new Error(`stuck at ${node.currentTime}`)),
              8_000
            );
            const tick = () => {
              if (node.currentTime >= min) {
                window.clearTimeout(timer);
                node.removeEventListener('timeupdate', tick);
                resolve();
              }
            };
            node.addEventListener('timeupdate', tick);
            tick();
          });

        const first = document.createElement('audio');
        first.src = tone;
        first.volume = 1;
        document.body.appendChild(first);
        await first.play();
        await waitUntil(first, 0.45);

        const video = document.createElement('video');
        video.src = clip;
        video.muted = true;
        document.body.appendChild(video);
        try {
          await video.play();
        } catch {
          /* a refused play is the result we want */
        }
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        const afterMutedVideo = {
          audioPaused: first.paused,
          audioTime: first.currentTime,
          videoPaused: video.paused,
        };

        const second = document.createElement('audio');
        second.src = tone;
        document.body.appendChild(second);
        try {
          await second.play();
        } catch {
          /* passive duplicate is paused from the play event */
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        const afterPassiveCopy = {
          firstPaused: first.paused,
          secondPaused: second.paused,
          firstTime: first.currentTime,
        };

        const handoffFrom = first.currentTime;
        second.dataset.osMediaIntent = 'explicit';
        await second.play();
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        return {
          afterMutedVideo,
          afterPassiveCopy,
          handoff: {
            firstPaused: first.paused,
            secondPaused: second.paused,
            secondTime: second.currentTime,
            handoffFrom,
          },
        };
      },
      { tone: TONE_URL, clip: CLIP_URL }
    );

    expect(result.afterMutedVideo.audioPaused).toBe(false);
    expect(result.afterMutedVideo.audioTime).toBeGreaterThan(0.4);
    expect(result.afterMutedVideo.videoPaused).toBe(true);
    expect(result.afterPassiveCopy.firstPaused).toBe(false);
    expect(result.afterPassiveCopy.secondPaused).toBe(true);
    expect(result.handoff.firstPaused).toBe(true);
    expect(result.handoff.secondPaused).toBe(false);
    expect(result.handoff.secondTime).toBeGreaterThan(0.3);
    expect(result.handoff.secondTime).toBeGreaterThan(
      result.handoff.handoffFrom - 0.35
    );
  });
});
