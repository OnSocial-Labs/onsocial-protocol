import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rollingMotion } from '@/components/ui/rolling-digits';

const uiSrc = dirname(fileURLToPath(import.meta.url));

describe('first-like zero crossing paint', () => {
  it('snaps 0→1 and lags fromValue via useLayoutEffect (no adjust-during-render)', () => {
    expect(rollingMotion(1, 0, { fromValue: 0, toValue: 1 })).toBe('snap');
    const source = readFileSync(join(uiSrc, 'rolling-number.tsx'), 'utf8');
    expect(source).toContain('useLayoutEffect');
    // Adjust-during-render collapses from→to before DigitRoll commits — banned.
    expect(source).not.toMatch(
      /useState\(safe\);\s*if \(fromValue !== safe\) \{\s*setFromValue\(safe\);\s*\}/
    );
    expect(source).toMatch(
      /useLayoutEffect\(\(\) => \{\s*if \(fromValue !== safe\) \{[\s\S]*?setFromValue\(safe\);/
    );
  });
});
