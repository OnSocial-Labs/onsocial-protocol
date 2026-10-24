import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeldEditionList } from '@/features/collectibles/held-editions-sheet';
import { heldEditionLabel } from '@/features/collectibles/held-editions';
import type { OwnedScarceItem } from '@/features/market/market-listings';

function edition(tokenId: string): OwnedScarceItem {
  return {
    tokenId,
    title: 'Night Drive',
    ownerId: 'alice.near',
    listingKind: null,
  };
}

describe('held editions', () => {
  it('names the seat and never the token id', () => {
    expect(heldEditionLabel('night-drive:4')).toBe('Edition 4');
    expect(heldEditionLabel('night-drive:5')).toBe('Edition 5');
    expect(heldEditionLabel('s:post')).toBe('Edition');
    expect(heldEditionLabel('night-drive:4')).not.toContain('night-drive');
  });

  it('lists each edition with Transfer, Sell, and History', () => {
    const html = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [edition('night-drive:5'), edition('night-drive:4')],
        onTransfer: () => {},
        onSell: () => {},
        onHistory: () => {},
      })
    );
    expect(html).toContain('Edition 5');
    expect(html).toContain('Edition 4');
    expect(html).toContain('Transfer');
    expect(html).toContain('Sell');
    expect(html).toContain('History');
    expect(html).not.toContain('night-drive:4');
    expect(html).not.toContain('night-drive:5');
  });
});
