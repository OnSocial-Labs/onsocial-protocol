import { expect, test, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  gotoApp,
} from './helpers';
import {
  setE2eGraphProfile,
  setE2eGraphWriting,
} from './helpers/e2e-graph';

type FaceProbe = {
  first: number | null;
  last: number | null;
  cls: number;
  identityShift: number;
};

async function armFaceProbe(page: Page): Promise<void> {
  // A function body keeps TypeScript syntax. The browser evaluates the string.
  await page.addInitScript(`(() => {
    try {
      localStorage.setItem('onsocial.app.wallet.accountId', 'alice.testnet');
      localStorage.setItem('onsocial.e2e.accountId', 'alice.testnet');
    } catch (error) {}
    const face = { first: null, last: null, cls: 0, identityShift: 0 };
    window.__portfolioFace = face;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          const value = entry.value || 0;
          face.cls += value;
          for (const source of entry.sources || []) {
            const node = source.node;
            if (
              node instanceof Element &&
              node.closest('.portfolio-identity, .portfolio-hero')
            ) {
              face.identityShift += value;
            }
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (error) {}
    const mark = () => {
      const el = document.querySelector(
        '.portfolio-identity:not([aria-busy="true"])'
      );
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      if (rect.height < 1 || rect.width < 1) return;
      if (face.first == null) face.first = rect.top;
      face.last = rect.top;
    };
    const arm = () => {
      if (!document.documentElement) return false;
      mark();
      if (face.armed) return true;
      face.armed = true;
      new MutationObserver(mark).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      const loop = () => {
        mark();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return true;
    };
    const wait = () => {
      if (!arm()) setTimeout(wait, 0);
    };
    wait();
  })();`);
}

async function expectStablePill(page: Page): Promise<void> {
  await armFaceProbe(page);
  await gotoApp(page, '/@alice.testnet');
  await dismissNextDevOverlay(page);
  const entry = page.getByRole('button', { name: 'Open page', exact: true });
  await expect(entry).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );

  const face = await page.evaluate(() => {
    const probe = (window as Window & { __portfolioFace?: FaceProbe })
      .__portfolioFace;
    const identity = document.querySelector('.portfolio-identity');
    return {
      probe,
      inlineMargin:
        identity instanceof HTMLElement ? identity.style.marginTop : null,
    };
  });
  expect(face.probe?.first).not.toBeNull();
  expect(face.probe?.last).not.toBeNull();
  expect(
    Math.abs((face.probe?.first ?? 0) - (face.probe?.last ?? 0))
  ).toBeLessThan(0.5);
  expect(face.probe?.identityShift ?? 1).toBe(0);
  expect(face.probe?.cls ?? 1).toBe(0);
  expect(face.inlineMargin).toBe('');

  const box = await entry.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(24);
  expect(Math.round(box!.height)).toBe(14);

  const hit = await entry.evaluate((el) => {
    const layer = getComputedStyle(el, '::after');
    const frost = getComputedStyle(el, '::before');
    const rect = el.getBoundingClientRect();
    const above = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top - 16
    );
    return {
      width: Number.parseFloat(layer.width),
      height: Number.parseFloat(layer.height),
      content: layer.content,
      backdrop:
        frost.backdropFilter ||
        frost.getPropertyValue('-webkit-backdrop-filter'),
      aboveIsPill:
        above === el || Boolean(above?.closest('.portfolio-page-chevron')),
    };
  });
  expect(Math.round(hit.width)).toBe(44);
  expect(Math.round(hit.height)).toBe(44);
  expect(hit.content).not.toBe('none');
  expect(hit.backdrop).toMatch(/blur/);
  expect(hit.aboveIsPill).toBe(true);
  await expect(entry).toHaveAccessibleName('Open page');
}

test.describe('portfolio swipe-up pill', () => {
  test('keeps the face still and offers a 44px hit', async ({ page }) => {
    await expectStablePill(page);
  });

  test('keeps the face still on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectStablePill(page);
  });

  test('stays off writing and another user’s writing', async ({ page }) => {
    await setE2eGraphWriting(page, 'shelf');
    await gotoApp(page, '/@alice.testnet?shelf=/writing');
    await page.waitForURL(/\/@alice\.testnet\/writing\/?$/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document
              .querySelector('.portfolio-frame')
              ?.classList.contains('is-portfolio-swipe')
          ),
        { timeout: E2E_CHROME_TIMEOUT_MS }
      )
      .toBe(false);
    await expect(
      page.getByRole('button', { name: 'Open page', exact: true })
    ).toHaveCount(0);
    const clearance = await page.evaluate(() => {
      const frame = document.querySelector('.portfolio-frame');
      const slot = document.querySelector('.portfolio-face-slot');
      if (!(frame instanceof HTMLElement) || !(slot instanceof HTMLElement)) {
        return null;
      }
      return {
        swipe: frame.classList.contains('is-portfolio-swipe'),
        clearance: getComputedStyle(frame)
          .getPropertyValue('--portfolio-face-clearance')
          .trim(),
        slot: Number.parseFloat(getComputedStyle(slot).height),
      };
    });
    expect(clearance?.swipe).toBe(false);
    expect(clearance?.clearance).toBe('0px');
    expect(clearance?.slot ?? 99).toBeLessThan(90);

    await gotoApp(page, '/@bob.testnet');
    await dismissNextDevOverlay(page);
    await expect(
      page.getByRole('button', { name: 'Open page', exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    await gotoApp(page, '/@bob.testnet?shelf=/writing');
    await page.waitForURL(/\/@bob\.testnet\/writing\/?$/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(
      page.getByRole('button', { name: 'Open page', exact: true })
    ).toHaveCount(0);
  });
});

const LINKED_PHONES = [
  { name: 'iPhone', width: 390, height: 844 },
  { name: 'Samsung', width: 360, height: 780 },
  { name: 'Pixel', width: 412, height: 915 },
] as const;

async function stubShorterVisualViewport(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    var lift = 56;
    var real = window.visualViewport;
    var vv = {
      get height() { return Math.max(320, (window.innerHeight || 0) - lift); },
      get width() { return window.innerWidth || 0; },
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      addEventListener: function (type, fn) {
        if (real && real.addEventListener) real.addEventListener(type, fn);
      },
      removeEventListener: function (type, fn) {
        if (real && real.removeEventListener) real.removeEventListener(type, fn);
      }
    };
    try {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        get: function () { return vv; }
      });
    } catch (error) {}
  })();`);
}

async function openLinkedFace(
  page: Page,
  viewport: { width: number; height: number }
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.addInitScript(`(() => {
    try {
      localStorage.setItem('onsocial.app.wallet.accountId', 'alice.testnet');
    } catch (error) {}
  })();`);
  await setE2eGraphProfile(page, 'links');
  await setE2eGraphWriting(page, 'empty');
  await gotoApp(page, '/@alice.testnet');
  await dismissNextDevOverlay(page);
  await expect(page.locator('.portfolio-link')).toHaveCount(3, {
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect(
    page.getByRole('button', { name: 'Open page', exact: true })
  ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
}

async function measurePillAgainstFace(page: Page): Promise<{
  hits: string[];
  pillTop: number;
  linksBottom: number;
  frameBottom: number;
  dockBottom: number;
  dockVar: string;
}> {
  return page.evaluate(() => {
    const pill = document.querySelector('button.portfolio-page-chevron');
    const links = document.querySelector('.portfolio-links');
    const frame = document.querySelector('.portfolio-frame');
    const dock = document.querySelector('.portfolio-summon-dock');
    if (
      !(pill instanceof HTMLElement) ||
      !(links instanceof HTMLElement) ||
      !(frame instanceof HTMLElement) ||
      !(dock instanceof HTMLElement)
    ) {
      throw new Error('missing pill face');
    }
    const previous = pill.style.visibility;
    pill.style.visibility = 'hidden';
    const box = pill.getBoundingClientRect();
    const hits = new Set<string>();
    const seen = (el: Element | null) => {
      const face = el?.closest(
        '.portfolio-link, .portfolio-bio, .portfolio-name, .portfolio-handle, .portfolio-links, .portfolio-identity'
      );
      if (face) hits.add(face.className.toString());
    };
    for (let y = box.top + 1; y < box.bottom - 1; y += 3) {
      for (let x = box.left + 1; x < box.right - 1; x += 6) {
        seen(document.elementFromPoint(x, y));
      }
    }
    pill.style.visibility = previous;
    return {
      hits: [...hits],
      pillTop: box.top,
      linksBottom: links.getBoundingClientRect().bottom,
      frameBottom: frame.getBoundingClientRect().bottom,
      dockBottom: dock.getBoundingClientRect().bottom,
      dockVar: getComputedStyle(document.documentElement)
        .getPropertyValue('--portfolio-dock-bottom')
        .trim(),
    };
  });
}

test.describe('portfolio pill clears social links', () => {
  for (const phone of LINKED_PHONES) {
    test(`does not cover links, bio, or identity on ${phone.name} @webkit`, async ({
      page,
    }) => {
      await openLinkedFace(page, phone);
      const measured = await measurePillAgainstFace(page);
      expect(measured.hits).toEqual([]);
      expect(Math.abs(measured.frameBottom - measured.dockBottom)).toBeLessThan(
        2
      );
    });
  }

  test('keeps the same edge when the visual viewport is shorter @webkit', async ({
    page,
  }) => {
    await stubShorterVisualViewport(page);
    await openLinkedFace(page, { width: 360, height: 780 });
    const measured = await measurePillAgainstFace(page);
    expect(measured.hits).toEqual([]);
    expect(measured.dockVar).toBe('56px');
    expect(Math.abs(measured.frameBottom - measured.dockBottom)).toBeLessThan(
      2
    );
    expect(measured.dockBottom).toBeLessThan(780 - 40);
  });

  test('keeps links clear in standalone display mode @webkit', async ({
    page,
  }) => {
    await page.addInitScript(`(() => {
      var real = window.matchMedia.bind(window);
      window.matchMedia = function (query) {
        if (String(query).indexOf('display-mode: standalone') !== -1) {
          return {
            matches: true,
            media: String(query),
            addListener: function () {},
            removeListener: function () {},
            addEventListener: function () {},
            removeEventListener: function () {},
            dispatchEvent: function () { return false; },
            onchange: null
          };
        }
        return real(query);
      };
    })();`);
    await openLinkedFace(page, { width: 412, height: 915 });
    const standalone = await page.evaluate(() => ({
      media: window.matchMedia('(display-mode: standalone)').matches,
      attr: document.documentElement.hasAttribute('data-pwa-standalone'),
    }));
    expect(standalone.media).toBe(true);
    expect(standalone.attr).toBe(true);
    const measured = await measurePillAgainstFace(page);
    expect(measured.hits).toEqual([]);
    expect(Math.abs(measured.frameBottom - measured.dockBottom)).toBeLessThan(
      2
    );
  });
});
