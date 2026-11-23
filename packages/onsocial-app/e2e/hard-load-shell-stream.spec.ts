import { expect, test, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp, settledNode } from './helpers';

/**
 * Hard loads stream the real known shell — no busy route stub, no parent
 * index skeleton, no leftover Flight twin under `[id^="S:"]`.
 */
type ShellStream = {
  dropCreateForm: number;
  dropCreateBusy: number;
  summonDock: number;
  pageChevron: number;
  portfolioPending: number;
};

declare global {
  interface Window {
    __onsocialHardLoadShell?: ShellStream;
  }
}

function installShellStreamObserver(): void {
  const state: ShellStream = {
    dropCreateForm: 0,
    dropCreateBusy: 0,
    summonDock: 0,
    pageChevron: 0,
    portfolioPending: 0,
  };
  window.__onsocialHardLoadShell = state;

  const sampleNow = () => {
    state.dropCreateForm = Math.max(
      state.dropCreateForm,
      document.querySelectorAll('.drop-create-form').length
    );
    state.dropCreateBusy = Math.max(
      state.dropCreateBusy,
      document.querySelectorAll('.drop-create-form[aria-busy="true"]').length
    );
    // Peak only the committed shell — Flight keeps a twin under `[id^="S:"]`.
    state.summonDock = Math.max(
      state.summonDock,
      document.querySelectorAll(
        '.portfolio-summon-dock:not([id^="S:"] .portfolio-summon-dock)'
      ).length
    );
    state.pageChevron = Math.max(
      state.pageChevron,
      document.querySelectorAll(
        '.portfolio-page-chevron:not([id^="S:"] .portfolio-page-chevron)'
      ).length
    );
    state.portfolioPending = Math.max(
      state.portfolioPending,
      document.querySelectorAll(
        '.portfolio-identity[aria-busy="true"]'
      ).length
    );
  };

  let pending = false;
  const sample = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      sampleNow();
    });
  };

  const observer = new MutationObserver(sample);
  observer.observe(document, { childList: true, subtree: true });
  sample();
  document.addEventListener('DOMContentLoaded', sampleNow);
}

function openingTags(html: string): string[] {
  return html.match(/<[^/!][^>]*>/g) ?? [];
}

function classListHas(tag: string, className: string): boolean {
  const match = /\sclass="([^"]*)"/.exec(tag);
  if (!match) return false;
  return match[1].split(/\s+/).includes(className);
}

function readyDropForms(html: string): string[] {
  return openingTags(html).filter(
    (tag) =>
      tag.startsWith('<form') &&
      tag.includes('id="drop-create-form"') &&
      classListHas(tag, 'drop-create-form')
  );
}

function tagAttr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match?.[1] ?? null;
}

function countBusyDropCreate(html: string): number {
  return openingTags(html).filter(
    (tag) =>
      classListHas(tag, 'drop-create-form') && tag.includes('aria-busy="true"')
  ).length;
}

function countPortfolioPendingFrames(html: string): number {
  return openingTags(html).filter(
    (tag) =>
      classListHas(tag, 'portfolio-identity') &&
      tag.includes('aria-busy="true"')
  ).length;
}

async function readShellStream(page: Page): Promise<ShellStream> {
  return page.evaluate(() => {
    const state = window.__onsocialHardLoadShell;
    if (!state) {
      throw new Error('shell stream observer missing');
    }
    return state;
  });
}

test.describe('hard-load streamed shells', () => {
  test('hard load of /drops/create draws one ready form and no busy stub', async ({
    page,
    request,
  }) => {
    const response = await request.get('/drops/create');
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(readyDropForms(html)).toHaveLength(1);
    expect(countBusyDropCreate(html)).toBe(0);

    await page.addInitScript(installShellStreamObserver);
    await gotoApp(page, '/drops/create');
    const stream = await readShellStream(page);
    expect(stream.dropCreateBusy).toBe(0);
    expect(stream.dropCreateForm).toBe(1);

    const form = settledNode(page, 'form#drop-create-form');
    await expect(form).toHaveCount(1);
    await expect(form).toHaveAttribute('data-drop-create-ready', '', {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(
      page.locator('.drop-create-form[aria-busy="true"]')
    ).toHaveCount(0);
  });

  test('hard load of /drops/create?series= prefills the server form', async ({
    request,
  }) => {
    const response = await request.get('/drops/create?series=Night+Roads');
    expect(response.ok()).toBe(true);
    const forms = readyDropForms(await response.text());
    expect(forms).toHaveLength(1);
    expect(tagAttr(forms[0]!, 'data-drop-create-series')).toBe('Night Roads');
  });

  test('hard load of /@alice.testnet streams the real face without a pending stub', async ({
    page,
    request,
  }) => {
    const response = await request.get('/@alice.testnet');
    expect(response.ok()).toBe(true);
    expect(countPortfolioPendingFrames(await response.text())).toBe(0);

    await page.addInitScript(installShellStreamObserver);
    await gotoApp(page, '/@alice.testnet');
    const stream = await readShellStream(page);
    expect(stream.portfolioPending).toBe(0);
    expect(stream.summonDock).toBe(1);
    expect(stream.pageChevron).toBe(1);

    await expect(settledNode(page, '.portfolio-summon-dock')).toHaveCount(1);
    await expect(settledNode(page, '.portfolio-page-chevron')).toHaveCount(1);
    await expect(
      page.locator('.portfolio-identity[aria-busy="true"]')
    ).toHaveCount(0);
  });
});
