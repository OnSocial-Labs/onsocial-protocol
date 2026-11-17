import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rollingMotion } from '@/components/ui/rolling-digits';

const uiSrc = dirname(fileURLToPath(import.meta.url));

describe('first-like zero crossing paint', () => {
  it('snaps 0→1 and latches previous toValue inside the DigitRoll effect', () => {
    expect(rollingMotion(1, 0, { fromValue: 0, toValue: 1 })).toBe('snap');
    const source = readFileSync(join(uiSrc, 'rolling-number.tsx'), 'utf8');
    expect(source).toContain('prevToValueRef');
    // Adjust-during-render collapses from→to before DigitRoll commits — banned.
    expect(source).not.toMatch(
      /useState\(safe\);\s*if \(fromValue !== safe\) \{\s*setFromValue\(safe\);\s*\}/
    );
    // Layout-effect setFromValue re-rendered DigitRoll and cancelled the first rAF.
    expect(source).not.toMatch(/setFromValue\(safe\)/);
    expect(source).not.toMatch(/fromValue=\{fromValue\}/);
    expect(source).toMatch(/prevToValueRef\.current = toValue/);
  });
});
