import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aboutCraftPromptDismissKey,
  readAboutCraftPromptDismissed,
  shouldShowAboutCraftPrompt,
  writeAboutCraftPromptDismissed,
} from '@/lib/about-craft-prompt';

function stubLocalStorage(store: Record<string, string> = {}) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('about-craft-prompt', () => {
  it('shows only for the owner of a craft-kind profile with no crafts yet', () => {
    const base = {
      viewerAccountId: 'alice.near',
      profileAccountId: 'alice.near',
      showsCrafts: true,
      hasCrafts: false,
      dismissed: false,
    };
    expect(shouldShowAboutCraftPrompt(base)).toBe(true);
    expect(
      shouldShowAboutCraftPrompt({ ...base, viewerAccountId: 'bob.near' })
    ).toBe(false);
    expect(shouldShowAboutCraftPrompt({ ...base, viewerAccountId: null })).toBe(
      false
    );
    expect(shouldShowAboutCraftPrompt({ ...base, showsCrafts: false })).toBe(
      false
    );
    expect(shouldShowAboutCraftPrompt({ ...base, hasCrafts: true })).toBe(
      false
    );
    expect(shouldShowAboutCraftPrompt({ ...base, dismissed: true })).toBe(
      false
    );
  });

  it('matches owner case-insensitively', () => {
    expect(
      shouldShowAboutCraftPrompt({
        viewerAccountId: 'Alice.NEAR',
        profileAccountId: 'alice.near',
        showsCrafts: true,
        hasCrafts: false,
        dismissed: false,
      })
    ).toBe(true);
  });

  it('persists dismissal per account', () => {
    const store = stubLocalStorage();
    expect(readAboutCraftPromptDismissed('alice.near')).toBe(false);
    writeAboutCraftPromptDismissed('alice.near');
    expect(store[aboutCraftPromptDismissKey('alice.near')]).toBe('1');
    expect(readAboutCraftPromptDismissed('alice.near')).toBe(true);
    expect(readAboutCraftPromptDismissed('bob.near')).toBe(false);
  });

  it('reads as not-dismissed without a window', () => {
    expect(readAboutCraftPromptDismissed('alice.near')).toBe(false);
  });
});
