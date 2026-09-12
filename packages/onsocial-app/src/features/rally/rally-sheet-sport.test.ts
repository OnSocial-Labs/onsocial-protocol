import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RallySheetSport } from '@/features/rally/rally-sheet-sport';
import { RALLY_SPORT_LINE } from '@/lib/rally-season';

describe('RallySheetSport', () => {
  it('paints prize, sport, and a You row without a Portal hop', () => {
    const html = renderToStaticMarkup(
      createElement(RallySheetSport, {
        prizeLine: '1,500 SOCIAL · 48 in',
        viewerAccountId: 'you.near',
        rows: [
          { rank: 2, score: 80, accountId: 'b.near', displayName: 'Bea' },
          { rank: 3, score: 70, accountId: 'you.near' },
          { rank: 4, score: 60, accountId: 'd.near', displayName: 'Dee' },
        ],
      })
    );
    expect(html).toContain('1,500 SOCIAL · 48 in');
    expect(html).toContain(RALLY_SPORT_LINE);
    expect(html).toContain('You');
    expect(html).toContain('#2');
    expect(html).toContain('/@b.near');
    expect(html).not.toContain('portal');
    expect(html).not.toContain('Full standings');
  });
});
