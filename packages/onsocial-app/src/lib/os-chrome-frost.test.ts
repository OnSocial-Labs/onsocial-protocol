import { describe, expect, it } from 'vitest';
import {
  OS_CHROME_FROST_FILL,
  OS_CHROME_FROST_FILTER,
  osChromeFrostStyle,
} from '@/lib/os-chrome-frost';

describe('osChromeFrostStyle', () => {
  it('matches elevated OS header / os-chrome-glass recipe', () => {
    expect(OS_CHROME_FROST_FILL).toBe('rgb(var(--bg-rgb) / 0.72)');
    expect(OS_CHROME_FROST_FILTER).toBe('blur(20px) saturate(1.3)');
    expect(osChromeFrostStyle()).toEqual({
      background: OS_CHROME_FROST_FILL,
      backdropFilter: OS_CHROME_FROST_FILTER,
      WebkitBackdropFilter: OS_CHROME_FROST_FILTER,
    });
  });
});
