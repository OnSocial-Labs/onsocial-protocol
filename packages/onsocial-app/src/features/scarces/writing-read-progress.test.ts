import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, 'scarce-writing-read-sheet.tsx'), 'utf8');
const reader = readFileSync(
  join(here, 'collection-writing-reader.tsx'),
  'utf8'
);
const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('writing read progress wiring', () => {
  it('paints the hairline with scaleX from a ref, not a width percent', () => {
    expect(sheet).toContain('paintWritingProgressFill');
    expect(sheet).toContain('fillRef');
    expect(sheet).toContain('requestAnimationFrame');
    expect(sheet).not.toContain('width: `${progressPct}%`');
    expect(sheet).not.toContain('setScrollRatio');
  });

  it('eases only on chapter jump / restore and throttles persist', () => {
    expect(reader).toContain("reportProgress(ratio, 'scroll')");
    expect(reader).toContain("writingProgressEase('jump')");
    expect(reader).toContain('WRITING_SCROLL_PERSIST_MS');
    expect(reader).toContain('scheduleWritingScrollPersist');
    expect(reader).not.toContain('setChapterRatio');
  });

  it('does not tween width while scrolling', () => {
    expect(css).toContain('.scarce-writing-read-progress-fill.is-ease');
    expect(css).toContain(
      'transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
    );
    expect(css).not.toContain('transition: width 120ms ease-out');
  });
});
