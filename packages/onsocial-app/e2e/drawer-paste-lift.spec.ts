import { devices, expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { seedAuthenticatedNotifications } from './helpers/notifications-auth';

/**
 * Phone keyboard pans are simulated on visualViewport. A paste or a url
 * field used to write that pan as CSS top, which uncovered a strip and
 * lifted the page under the editor.
 */

function phoneUse(device: (typeof devices)['iPhone 13']) {
  return {
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  };
}

const PROFILES = [
  { name: 'iphone', use: phoneUse(devices['iPhone 13']) },
  { name: 'android', use: phoneUse(devices['Pixel 7']) },
] as const;

async function installKeyboardViewport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const listeners = new Map<string, Set<EventListener>>();
    let offsetTop = 0;
    let height = window.innerHeight;
    const viewport = {
      get offsetTop() {
        return offsetTop;
      },
      get offsetLeft() {
        return 0;
      },
      get height() {
        return height;
      },
      get width() {
        return window.innerWidth;
      },
      get pageTop() {
        return offsetTop;
      },
      get pageLeft() {
        return 0;
      },
      get scale() {
        return 1;
      },
      addEventListener(type: string, listener: EventListener) {
        const set = listeners.get(type) ?? new Set<EventListener>();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      },
    };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });
    (
      window as unknown as {
        __setKeyboardViewport?: (next: {
          offsetTop?: number;
          height?: number;
        }) => void;
      }
    ).__setKeyboardViewport = (next) => {
      if (typeof next.height === 'number') height = next.height;
      if (typeof next.offsetTop === 'number') offsetTop = next.offsetTop;
      for (const listener of listeners.get('resize') ?? []) {
        listener(new Event('resize'));
      }
      for (const listener of listeners.get('scroll') ?? []) {
        listener(new Event('scroll'));
      }
    };
  });
}

/**
 * Brave / Chromium tab shape: visualViewport stays full height while the
 * Virtual Keyboard API reports the real key top. Without VK seating the
 * drawer ends above a gap; with it the root bottom sits on the keys.
 */
async function installBraveVirtualKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const vvListeners = new Map<string, Set<EventListener>>();
    let offsetTop = 0;
    let height = window.innerHeight;
    const viewport = {
      get offsetTop() {
        return offsetTop;
      },
      get offsetLeft() {
        return 0;
      },
      get height() {
        return height;
      },
      get width() {
        return window.innerWidth;
      },
      get pageTop() {
        return offsetTop;
      },
      get pageLeft() {
        return 0;
      },
      get scale() {
        return 1;
      },
      addEventListener(type: string, listener: EventListener) {
        const set = vvListeners.get(type) ?? new Set<EventListener>();
        set.add(listener);
        vvListeners.set(type, set);
      },
      removeEventListener(type: string, listener: EventListener) {
        vvListeners.get(type)?.delete(listener);
      },
    };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });

    const geometryListeners = new Set<EventListener>();
    let overlaysContent = false;
    let boundingRect = { x: 0, y: 0, width: 0, height: 0 };
    const virtualKeyboard = {
      get overlaysContent() {
        return overlaysContent;
      },
      set overlaysContent(value: boolean) {
        overlaysContent = Boolean(value);
      },
      get boundingRect() {
        return { ...boundingRect };
      },
      addEventListener(type: string, listener: EventListener) {
        if (type === 'geometrychange') geometryListeners.add(listener);
      },
      removeEventListener(type: string, listener: EventListener) {
        geometryListeners.delete(listener);
      },
    };
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      get: () => virtualKeyboard,
    });

    (
      window as unknown as {
        __setBraveKeyboard?: (next: { keyTop: number }) => void;
      }
    ).__setBraveKeyboard = (next) => {
      const keyTop = Math.max(0, Math.round(next.keyTop));
      // Production path: interactive-widget=resizes-content shrinks VV.
      offsetTop = 0;
      height = keyTop;
      boundingRect = {
        x: 0,
        y: keyTop,
        width: window.innerWidth,
        height: Math.max(0, window.innerHeight - keyTop),
      };
      for (const listener of vvListeners.get('resize') ?? []) {
        listener(new Event('resize'));
      }
      for (const listener of geometryListeners) {
        listener(new Event('geometrychange'));
      }
    };
  });
}

async function stubProfileEditor(
  page: Page,
  kind: 'person' | 'org'
): Promise<void> {
  await page.route('**/api/profile/editor**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accountId: 'alice.testnet',
        hasProfile: true,
        name: kind === 'org' ? 'Atelier' : 'Alice',
        location: '',
        industry: '',
        kind,
        bio: 'Builds in public',
        about: '',
        lead: '',
        aboutAlign: 'left',
        avatarUrl: null,
        bannerUrl: null,
        bannerMedia: null,
        links: {},
        pageConfig: {},
        tags: [],
        photos: [],
      }),
    });
  });
}

async function openEditor(page: Page): Promise<void> {
  await seedAuthenticatedNotifications(page);
  await gotoApp(page, '/');
  await dismissNextDevOverlay(page);
  await page.getByRole('button', { name: /^You, @/ }).click();
  const accountRow = page.getByRole('button', {
    name: /Account[\s\S]*Profile, alerts, log out/,
  });
  await expect(accountRow).toBeVisible({ timeout: 15_000 });
  await accountRow.click();
  const accountMenu = page.getByRole('dialog', { name: 'Account' });
  await expect(accountMenu).toBeVisible({ timeout: 15_000 });
  await accountMenu.getByRole('button', { name: /Edit profile/ }).click();
  await expect(page.getByRole('dialog', { name: 'Edit profile' })).toBeVisible({
    timeout: 15_000,
  });
}

async function setKeyboard(
  page: Page,
  input: { offsetTop: number; lift: number }
): Promise<void> {
  await page.evaluate(async (next) => {
    const set = (
      window as unknown as {
        __setKeyboardViewport?: (value: {
          offsetTop?: number;
          height?: number;
        }) => void;
      }
    ).__setKeyboardViewport;
    if (!set) throw new Error('keyboard viewport shim missing');
    set({
      offsetTop: next.offsetTop,
      height: Math.max(240, window.innerHeight - next.lift),
    });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }, input);
}

async function readFrame(page: Page, panelSelector: string) {
  return page.evaluate((selector) => {
    const panel = document.querySelector(selector);
    const root = panel?.closest('.glass-sheet-root');
    const screen = document.querySelector('.os-app-screen');
    const rootRect = root?.getBoundingClientRect();
    const screenRect = screen?.getBoundingClientRect();
    return {
      rootTop: rootRect?.top ?? null,
      rootBottom: rootRect?.bottom ?? null,
      rootHeight: rootRect?.height ?? null,
      screenTop: screenRect?.top ?? null,
      scrollY: window.scrollY,
    };
  }, panelSelector);
}

async function setBraveKeyboard(
  page: Page,
  input: { keyTop: number }
): Promise<void> {
  await page.evaluate(async (next) => {
    const set = (
      window as unknown as {
        __setBraveKeyboard?: (value: { keyTop: number }) => void;
      }
    ).__setBraveKeyboard;
    if (!set) throw new Error('brave keyboard shim missing');
    set(next);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }, input);
}

for (const profile of PROFILES) {
  test.describe(`drawer paste lift (${profile.name})`, () => {
    test.use(profile.use);

    test('paste in Edit profile keeps the page on the visual top', async ({
      page,
    }) => {
      await installKeyboardViewport(page);
      await stubProfileEditor(page, 'person');
      await openEditor(page);
      const editor = page.getByRole('dialog', { name: 'Edit profile' });
      const name = editor.getByRole('textbox', { name: 'Display name' });
      await name.click();
      await setKeyboard(page, { offsetTop: 0, lift: 320 });
      await name.fill('Ada Lovelace');
      await name.evaluate((node) => {
        const data = new DataTransfer();
        data.setData('text/plain', 'Ada Lovelace');
        node.dispatchEvent(
          new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: data,
          })
        );
      });
      // Paste pan: height stays inside the keyboard slop, top jumps.
      await setKeyboard(page, { offsetTop: 96, lift: 300 });
      const frame = await readFrame(page, '.profile-edit-sheet-panel');
      expect(frame.scrollY).toBe(0);
      expect(frame.rootTop).toBeLessThan(12);
      expect(frame.screenTop).toBeLessThan(12);
      await page.screenshot({
        path: `/opt/cursor/artifacts/edit-profile-paste-${profile.name}.png`,
        fullPage: true,
      });
    });

    test('paste in the portfolio editor keeps the page on the visual top', async ({
      page,
    }) => {
      await installKeyboardViewport(page);
      await stubProfileEditor(page, 'org');
      await openEditor(page);
      const editor = page.getByRole('dialog', { name: 'Edit profile' });
      const name = editor.getByRole('textbox', { name: 'Display name' });
      await name.click();
      await setKeyboard(page, { offsetTop: 0, lift: 320 });
      await name.fill('Atelier North');
      await setKeyboard(page, { offsetTop: 96, lift: 300 });
      const frame = await readFrame(page, '.profile-edit-sheet-panel');
      expect(frame.scrollY).toBe(0);
      expect(frame.rootTop).toBeLessThan(12);
      expect(frame.screenTop).toBeLessThan(12);
      await page.screenshot({
        path: `/opt/cursor/artifacts/edit-portfolio-paste-${profile.name}.png`,
        fullPage: true,
      });
    });

    test('Add link title stays put and the link field does not lift the page', async ({
      page,
    }) => {
      await installKeyboardViewport(page);
      await stubProfileEditor(page, 'person');
      await openEditor(page);
      const editor = page.getByRole('dialog', { name: 'Edit profile' });
      await editor.getByRole('button', { name: 'Add link' }).click();
      await page.getByRole('menuitem', { name: 'Website' }).click();
      const drawer = page.getByRole('dialog', { name: 'New link' });
      await expect(drawer).toBeVisible();
      const title = drawer.getByRole('textbox', { name: 'Title' });
      await title.click();
      await setKeyboard(page, { offsetTop: 0, lift: 320 });
      const titleFrame = await readFrame(page, '.account-editor-link-sheet');
      expect(titleFrame.rootTop).toBeLessThan(12);
      expect(titleFrame.scrollY).toBe(0);
      await page.screenshot({
        path: `/opt/cursor/artifacts/add-link-title-${profile.name}.png`,
        fullPage: true,
      });

      await setKeyboard(page, { offsetTop: 0, lift: 0 });
      const link = drawer.getByRole('textbox', { name: 'Link' });
      await link.click();
      // Url keyboard opens already panned. That pan must not become CSS top.
      await setKeyboard(page, { offsetTop: 120, lift: 340 });
      const linkFrame = await readFrame(page, '.account-editor-link-sheet');
      const pageFrame = await readFrame(page, '.profile-edit-sheet-panel');
      expect(linkFrame.rootTop).toBeLessThan(12);
      expect(pageFrame.rootTop).toBeLessThan(12);
      expect(linkFrame.scrollY).toBe(0);
      await page.screenshot({
        path: `/opt/cursor/artifacts/add-link-field-${profile.name}.png`,
        fullPage: true,
      });
    });

    test('Virtual Keyboard overlay seats the Location drawer on the keys', async ({
      page,
    }) => {
      await installBraveVirtualKeyboard(page);
      await stubProfileEditor(page, 'person');
      await openEditor(page);
      const editor = page.getByRole('dialog', { name: 'Edit profile' });
      await editor.getByRole('button', { name: 'Location, Based in' }).click();
      const drawer = page.getByRole('dialog', { name: 'Location' });
      await expect(drawer).toBeVisible({ timeout: 15_000 });
      const field = drawer.getByRole('textbox', { name: 'Based in' });
      await field.click();

      const keyTop = await page.evaluate(() =>
        Math.max(280, window.innerHeight - 320)
      );
      await setBraveKeyboard(page, { keyTop });

      // Hug choice drawers sit on the bottom of the pinned root — flush to keys.
      const box = await drawer.boundingBox();
      expect(box).not.toBeNull();
      const bottom = (box?.y ?? 0) + (box?.height ?? 0);
      expect(Math.abs(bottom - keyTop)).toBeLessThan(12);
      await page.screenshot({
        path: `/opt/cursor/artifacts/location-vk-flush-${profile.name}.png`,
        fullPage: true,
      });
    });
  });
}
