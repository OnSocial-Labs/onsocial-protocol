import type { CSSProperties } from 'react';
import { describe, expect, it } from 'vitest';
import { resolveSheetMood, sheetMoodStyle } from './mood-theme.js';

function vars(style: Record<string, string>): CSSProperties {
  return style as CSSProperties;
}

describe('resolveSheetMood', () => {
  it('uses an explicit mood and its style', () => {
    const resolved = resolveSheetMood(
      { moodId: 'noir', style: vars({ '--mood-preset-bg': '#111' }) },
      { moodId: 'dawn', style: vars({ '--mood-preset-bg': '#eee' }) }
    );
    expect(resolved.moodId).toBe('noir');
    expect(resolved.style).toEqual(vars({ '--mood-preset-bg': '#111' }));
  });

  it('borrows the page style when the explicit id matches and no style was passed', () => {
    const resolved = resolveSheetMood(
      { moodId: 'dawn' },
      { moodId: 'dawn', style: vars({ '--mood-preset-bg': '#eee' }) }
    );
    expect(resolved).toEqual({
      moodId: 'dawn',
      style: vars({ '--mood-preset-bg': '#eee' }),
    });
  });

  it('does not borrow a different page mood', () => {
    const resolved = resolveSheetMood(
      { moodId: 'noir' },
      { moodId: 'dawn', style: vars({ '--mood-preset-bg': '#eee' }) }
    );
    expect(resolved).toEqual({ moodId: 'noir' });
  });

  it('inherits when the sheet passes no mood', () => {
    const resolved = resolveSheetMood(
      {},
      { moodId: 'dawn', style: vars({ '--mood-preset-bg': '#eee' }) }
    );
    expect(resolved.moodId).toBe('dawn');
  });

  it('strips a transparent mood background so the sheet recomputes the mix', () => {
    expect(
      sheetMoodStyle(
        vars({
          '--mood-bg': 'transparent',
          '--mood-preset-bg': '#111',
        })
      )
    ).toEqual(vars({ '--mood-preset-bg': '#111' }));
  });
});
