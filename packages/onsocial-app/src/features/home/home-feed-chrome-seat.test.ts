import { chromium, type Page } from '@playwright/test';
import { afterAll, describe, expect, it } from 'vitest';

const home = 'http://127.0.0.1:3060/home';

async function openHome(width: number, height: number): Promise<{
  close: () => Promise<void>;
  page: Page;
}> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.home-feed-block', { timeout: 30_000 });
  await page.waitForSelector('.home-feed-load-more', { timeout: 30_000 });
  return {
    page,
    close: () => browser.close(),
  };
}

describe('home chrome seats', () => {
  const closers: Array<() => Promise<void>> = [];
  afterAll(async () => {
    await Promise.all(closers.map((close) => close()));
  });

  it('keeps block document positions when the rail tucks', async () => {
    const session = await openHome(390, 844);
    closers.push(session.close);
    const read = () =>
      session.page.evaluate(() => {
        const root = document.querySelector('.os-app-screen-body');
        if (!(root instanceof HTMLElement)) return [];
        return [...document.querySelectorAll('.home-feed-block')]
          .slice(0, 4)
          .map((el) =>
            Math.round(el.getBoundingClientRect().top + root.scrollTop)
          );
      });
    const before = await read();
    expect(before.length).toBeGreaterThan(0);
    await session.page.evaluate(() => {
      document
        .querySelector('.home-feed-compact-chrome')
        ?.classList.add('is-scroll-hidden');
    });
    const after = await read();
    expect(after).toEqual(before);
  }, 60_000);

  it('keeps the load-more footer height when the in-flight dots mount', async () => {
    const session = await openHome(1280, 800);
    closers.push(session.close);
    const height = () =>
      session.page.evaluate(() => {
        const footer = document.querySelector('.home-feed-load-more');
        return footer
          ? Math.round(footer.getBoundingClientRect().height)
          : 0;
      });
    const resting = await height();
    expect(resting).toBeGreaterThan(1);
    await session.page.evaluate(() => {
      const footer = document.querySelector('.home-feed-load-more');
      if (!footer || footer.querySelector('.list-append-pending')) return;
      const row = document.createElement('div');
      row.className = 'list-append-pending';
      const dots = document.createElement('span');
      dots.className = 'protocol-pulsing-dots protocol-pulsing-dots--sm';
      for (let i = 0; i < 3; i += 1) {
        const dot = document.createElement('span');
        dot.className = 'protocol-pulsing-dots__dot';
        dots.appendChild(dot);
      }
      row.appendChild(dots);
      footer.appendChild(row);
    });
    expect(await height()).toBe(resting);
  }, 60_000);
});
