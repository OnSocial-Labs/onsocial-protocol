import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeldEditionList } from '@/features/collectibles/held-editions-sheet';
import {
  heldEditionFactRows,
  heldCopySuccessLine,
  heldEditionLabel,
  heldEditionMark,
  heldEditionRowMark,
  heldEditionSheetTitle,
  heldEditionTrailTimesDiffer,
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
  it('names a send sheet by the tap, and a browse sheet by the list', () => {
    expect(heldEditionSheetTitle('send')).toBe('Send');
    expect(heldEditionSheetTitle('open')).toBe('Editions');
  });

  it('names the seat and never the token id', () => {
    expect(heldEditionMark('night-drive:4')).toBe('#4');
    expect(heldEditionMark('s:post')).toBeNull();
    expect(heldEditionRowMark('night-drive:41', 1)).toBe('#41');
    expect(heldEditionRowMark('night-drive:41', 3)).toBeNull();
    expect(heldEditionLabel('night-drive:4')).toBe('Edition #4');
    expect(heldEditionLabel('night-drive:5', 'audio')).toBe('Edition #5');
    expect(heldEditionLabel('gate:2', 'ticket')).toBe('Pass #2');
    expect(heldEditionLabel('gate:2', 'membership')).toBe('Pass #2');
    expect(heldEditionLabel('save:3', 'coupon')).toBe('Coupon #3');
    expect(heldEditionLabel('s:post')).toBe('Edition');
    expect(heldEditionLabel('night-drive:4')).not.toContain('night-drive');
    expect(heldEditionLabel('gate:2', 'ticket')).not.toContain('gate');
  });

  it('names the seat on a success line only when that copy is known', () => {
    expect(heldCopySuccessLine('gate:3', 'ticket', 'collected')).toBe(
      'Pass #3 collected.'
    );
    expect(heldCopySuccessLine('save:3', 'coupon', 'collected')).toBe(
      'Coupon #3 collected.'
    );
    expect(heldCopySuccessLine('night:3', 'audio', 'collected')).toBe(
      'Collected #3.'
    );
    expect(heldCopySuccessLine('night:3', null, 'minted')).toBe('Minted #3.');
    expect(heldCopySuccessLine('gate:3', 'membership', 'minted')).toBe(
      'Minted Pass #3.'
    );
    expect(heldCopySuccessLine('save:3', 'coupon', 'sent', 'Ada')).toBe(
      'Sent Coupon #3 to Ada.'
    );
    expect(heldCopySuccessLine('night:3', null, 'sent', 'Ada')).toBe(
      'Sent #3 to Ada.'
    );
    expect(heldCopySuccessLine('s:post', null, 'collected')).toBeNull();
    expect(heldCopySuccessLine('night:3', null, 'sent', '  ')).toBeNull();
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
    expect(html).toContain('#5');
    expect(html).toContain('#4');
    expect(html).toContain('aria-label="Open #5"');
    expect(html).toContain('aria-label="Open #4"');
    expect(html).toContain('aria-label="More for #5"');
    expect(html).toContain('aria-label="More for #4"');
    expect(html).not.toContain('Edition #');
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
    expect(html).toContain('aria-label="Send #4"');
    expect(html).toContain('aria-label="More for #4"');
  });

  it('shows a cover on every copy once there is more than one', () => {
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
    expect(shared.match(/<img /g)?.length).toBe(2);

    const alone = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [edition('night-drive:1', 'https://cdn.example/cover.png')],
        choose: 'open',
        onChoose: () => {},
      })
    );
    expect(alone).not.toContain('<img');

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
    expect(varied).toContain('aria-label="Open #1"');
    expect(varied).toContain('aria-label="Open #3"');
    expect(varied).toContain('aria-label="More for #1"');
    expect(varied).not.toContain('night-drive:');
  });

  it('shows a trail time only when the stamps do not read the same', () => {
    expect(heldEditionTrailTimesDiffer(['2d', '1y'])).toBe(true);
    expect(heldEditionTrailTimesDiffer(['2d', '2d'])).toBe(false);
    expect(heldEditionTrailTimesDiffer(['2d', null])).toBe(true);
    expect(heldEditionTrailTimesDiffer([null, ''])).toBe(false);
    expect(heldEditionTrailTimesDiffer(["Jan 1 '70", "Jan 1 '70"])).toBe(false);

    const now = Date.now();
    const shared = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [
          { ...edition('night-drive:1'), mintedAtMs: now },
          { ...edition('night-drive:3'), mintedAtMs: now },
        ],
        choose: 'open',
        onChoose: () => {},
      })
    );
    expect(shared).not.toContain('<time');
    expect(shared).not.toContain('night-drive:');

    const split = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [
          { ...edition('night-drive:1'), mintedAtMs: now },
          {
            ...edition('night-drive:3'),
            mintedAtMs: now - 400 * 86_400_000,
          },
        ],
        choose: 'open',
        onChoose: () => {},
      })
    );
    expect(split).toContain('<time');
    expect(split).not.toContain('night-drive:');

    const partial = renderToStaticMarkup(
      createElement(HeldEditionList, {
        editions: [
          { ...edition('night-drive:1'), mintedAtMs: now },
          edition('night-drive:3'),
        ],
        choose: 'open',
        onChoose: () => {},
      })
    );
    expect(partial.match(/<time/g)).toHaveLength(1);
  });

  it('keeps the token id in facts, with a sale line only when listed', () => {
    expect(
      heldEditionFactRows({
        tokenId: ' night-drive:4 ',
        listingKind: null,
      })
    ).toEqual([{ label: 'Token', value: 'night-drive:4' }]);

    const minted = heldEditionFactRows({
      tokenId: 'night-drive:4',
      mintedAtMs: Date.UTC(2024, 0, 15, 12),
      listingKind: null,
    });
    expect(minted.map((row) => row.label)).toEqual(['Token', 'Minted']);
    expect(minted[1]?.value).toMatch(/2024/);

    expect(
      heldEditionFactRows({
        tokenId: 'night-drive:4',
        listingKind: 'fixed',
        listedPriceNear: '2',
      })
    ).toContainEqual({ label: 'Listed', value: '2 NEAR' });

    expect(
      heldEditionFactRows({
        tokenId: 'night-drive:4',
        listingKind: 'auction',
      })
    ).toContainEqual({ label: 'Listed', value: 'For sale' });

    const dollars = heldEditionFactRows({
      tokenId: 'night-drive:4',
      listingKind: 'fixed',
      listedUsdE6: '2500000',
    });
    expect(dollars.find((row) => row.label === 'Listed')?.value).toBe('$2.5');
  });
});
