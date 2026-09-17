import { expect, test, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  expectOsRowAction,
  gotoApp,
} from './helpers';
import {
  COLLECTION_E2E_VIEWER,
  expectCollectionHolderChrome,
  expectCollectionPageSettled,
  seedE2eWallet,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';

const HOLDER_BACK = `/@${COLLECTION_E2E_VIEWER}/collectibles`;

const LONG_CHAPTER = Array.from(
  { length: 48 },
  (_, index) => `Paragraph ${index + 1}. The hairline should track this scroll.`
).join('\n\n');

async function stubWritingChapter(page: Page): Promise<void> {
  await page.route('**/api/ipfs/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/markdown; charset=utf-8',
      body: LONG_CHAPTER,
    });
  });
}

async function openHeldReader(page: Page) {
  await seedE2eWallet(page);
  await setE2eGraphDrop(page, 'held');
  await stubCollectionPageGraph(page, {
    heldIds: ['chapter-one'],
    endedIds: ['chapter-one'],
  });
  await stubWritingChapter(page);
  await gotoApp(page, '/collection/chapter-one');
  await expectCollectionPageSettled(page);
  await expectCollectionHolderChrome(page, HOLDER_BACK);
  const read = page.getByRole('button', { name: 'Read', exact: true });
  await expectOsRowAction(read);
  const sheet = page.locator('.scarce-read-slide');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await dismissNextDevOverlay(page);
    await read.click({ force: true });
    try {
      await expect(sheet).toHaveClass(/is-open/, { timeout: 8_000 });
      await expect(
        sheet.locator('.scarce-writing-read-title')
      ).toBeInViewport();
      await expect
        .poll(async () =>
          sheet.evaluate((el) => {
            const t = getComputedStyle(el).transform;
            return (
              t === 'none' ||
              /^matrix\(1,\s*0,\s*0,\s*1,\s*0(\.0+)?,\s*0(\.0+)?\)$/.test(t)
            );
          })
        )
        .toBe(true);
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  await expect(sheet.locator('.collection-writing-markdown')).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect
    .poll(async () =>
      sheet.locator('.collection-writing-body').evaluate((el) => {
        return el.scrollHeight - el.clientHeight;
      })
    )
    .toBeGreaterThan(200);
  return sheet;
}

function fillMatrixA(transform: string): number {
  const match = transform.match(/^matrix\(([-0-9.eE]+),/);
  if (!match) return transform === 'none' ? 1 : Number.NaN;
  return Number.parseFloat(match[1] ?? '');
}

test.describe('writing read progress', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hairline uses scaleX and tracks scroll without a width tween', async ({
    page,
  }) => {
    const sheet = await openHeldReader(page);
    const fill = sheet.locator('.scarce-writing-read-progress-fill');
    const bar = sheet.locator('.scarce-writing-read-progress');
    const body = sheet.locator('.collection-writing-body');
    await expect(fill).toBeAttached();

    const before = await fill.evaluate((node) => {
      const style = getComputedStyle(node);
      const parent = node.parentElement;
      return {
        width: style.width,
        parentWidth: parent ? getComputedStyle(parent).width : '',
        transform: style.transform,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        className: node.className,
      };
    });
    expect(before.width).toBe(before.parentWidth);
    const start = fillMatrixA(before.transform);
    expect(Number.isFinite(start)).toBe(true);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThan(0.2);

    const artifacts = process.env.E2E_ARTIFACTS;
    if (artifacts) {
      await page.screenshot({
        path: `${artifacts}/writing_read_progress_idle.png`,
        fullPage: false,
      });
    }

    const scrollable = await body.evaluate(
      (el) => el.scrollHeight - el.clientHeight
    );
    expect(scrollable).toBeGreaterThan(200);
    // Restore ignores scroll for 480ms so the jump ease can run.
    await page.waitForTimeout(520);
    await body.evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.45);
    });

    await expect
      .poll(async () => {
        const transform = await fill.evaluate(
          (node) => getComputedStyle(node).transform
        );
        return fillMatrixA(transform);
      })
      .toBeGreaterThan(0.3);

    const after = await fill.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        width: style.width,
        transform: style.transform,
        transitionDuration: style.transitionDuration,
        className: node.className,
      };
    });
    expect(after.width).toBe(before.width);
    expect(after.className.includes('is-ease')).toBe(false);
    expect(
      after.transitionDuration === '0s' || after.transitionDuration === ''
    ).toBe(true);

    if (artifacts) {
      await page.screenshot({
        path: `${artifacts}/writing_read_progress_scrolled.png`,
        fullPage: false,
      });
    }

    await expect(bar).toHaveAttribute('aria-valuenow', /\d+/);
    const ariaNow = Number(await bar.getAttribute('aria-valuenow'));
    expect(ariaNow).toBeGreaterThan(30);
    expect(ariaNow).toBeLessThan(70);
  });
});
