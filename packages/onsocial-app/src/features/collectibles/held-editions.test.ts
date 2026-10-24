import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeldEditionList } from '@/features/collectibles/held-editions-sheet';
import {
  heldEditionCoversDiffer,
  heldEditionLabel,
} from '@/features/collectibles/held-editions';
import type { OwnedScarceItem } from '@/features/market/market-listings';

function edition(tokenId: string, mediaUrl?: string | null): OwnedScarceItem {
  return {
    tokenId,
    title: 'Night Drive',
    ownerId: 'alice.near',
    listingKind: null,
    ...(mediaUrl ? { mediaUrl } : {}),
  };
}

describe('held editions', () => {
  it('names the seat and never the token id', () => {
    expect(heldEditionLabel('night-drive:4')).toBe('Edition 4');
    expect(heldEditionLabel('night-drive:5')).toBe('Edition 5');
    expect(heldEditionLabel('s:post')).toBe('Edition');
    expect(heldEditionLabel('night-drive:4')).not.toContain('night-drive');
  });

  it('opens an edition from the row and keeps actions in one menu', () => {
    const html = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [edition('night-drive:5'), edition('night-drive:4')],
        choose: 'open',
        onChoose: () => {},
        onTransfer: () => {},
        onSell: () => {},
        onHistory: () => {},
      })
    );
    expect(html).toContain('Edition 5');
    expect(html).toContain('Edition 4');
    expect(html).toContain('aria-label="Open Edition 5"');
    expect(html).toContain('aria-label="Open Edition 4"');
    expect(html).toContain('aria-label="More for Edition 5"');
    expect(html).toContain('aria-label="More for Edition 4"');
    expect(html).not.toContain('night-drive:4');
    expect(html).not.toContain('night-drive:5');
    expect(html).not.toContain('<img');
  });

  it('sends the edition from the row when the sheet was opened to transfer', () => {
    const html = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [edition('night-drive:4')],
        choose: 'send',
        onChoose: () => {},
        onTransfer: () => {},
      })
    );
    expect(html).toContain('aria-label="Send Edition 4"');
    expect(html).toContain('aria-label="More for Edition 4"');
  });

  it('shows each cover only when the editions resolve to different art', () => {
    expect(
      heldEditionCoversDiffer([
        { mediaUrl: 'https://cdn.example/1.png' },
        { mediaUrl: 'https://cdn.example/1.png' },
      ])
    ).toBe(false);
    expect(
      heldEditionCoversDiffer([
        { mediaUrl: 'https://cdn.example/1.png' },
        { mediaUrl: null },
      ])
    ).toBe(false);

    const shared = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [
          edition('night-drive:1', 'https://cdn.example/cover.png'),
          edition('night-drive:3', 'https://cdn.example/cover.png'),
        ],
        choose: 'open',
        onChoose: () => {},
      })
    );
    expect(shared).not.toContain('<img');

    const varied = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [
          edition('night-drive:1', 'https://cdn.example/1.png'),
          edition('night-drive:3', 'https://cdn.example/3.png'),
        ],
        choose: 'open',
        onChoose: () => {},
        onTransfer: () => {},
        onHistory: () => {},
      })
    );
    expect(varied).toContain('src="https://cdn.example/1.png"');
    expect(varied).toContain('src="https://cdn.example/3.png"');
    expect(varied).toContain('aria-label="Open Edition 1"');
    expect(varied).toContain('aria-label="Open Edition 3"');
    expect(varied).toContain('aria-label="More for Edition 1"');
    expect(varied).not.toContain('night-drive:');
  });
});
