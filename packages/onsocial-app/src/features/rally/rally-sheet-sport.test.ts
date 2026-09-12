import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RallySheetSport } from '@/features/rally/rally-sheet-sport';

describe('RallySheetSport', () => {
  it('paints a You row without extra copy or a Portal hop', () => {
    const html = renderToStaticMarkup(
      createElement(RallySheetSport, {
        viewerAccountId: 'you.near',
        rows: [
          { rank: 2, score: 80, accountId: 'b.near', displayName: 'Bea' },
          { rank: 3, score: 70, accountId: 'you.near' },
          { rank: 4, score: 60, accountId: 'd.near', displayName: 'Dee' },
        ],
      })
    );
    expect(html).toContain('You');
    expect(html).toContain('#2');
    expect(html).toContain('/@b.near');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('SOCIAL');
    expect(html).not.toContain('Stand, endorse');
    expect(html).not.toContain('are carrying you');
    expect(html).not.toContain('portal');
    expect(html).not.toContain('Full standings');
  });

  it('renders nothing when the board is empty', () => {
    const html = renderToStaticMarkup(
      createElement(RallySheetSport, {
        rows: [],
      })
    );
    expect(html).toBe('');
  });
});
