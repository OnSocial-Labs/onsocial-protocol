import { describe, expect, it } from 'vitest';
import { toProfileCreatedPeek } from '@/lib/fetch-profile-peeks';

describe('toProfileCreatedPeek', () => {
  it('maps mint rows to collection deep links', () => {
    const peek = toProfileCreatedPeek({
      tokenId: 'quiet-hours:2',
      memo: 'The Quiet Hours',
      extraData: JSON.stringify({
        media: 'https://cdn.example/cover.png',
      }),
      blockTimestamp: 1_700_000_000_000,
    });
    expect(peek).toEqual({
      tokenId: 'quiet-hours:2',
      title: 'The Quiet Hours',
      mediaUrl: 'https://cdn.example/cover.png',
      blockTimestamp: 1_700_000_000_000,
      href: '/collection/quiet-hours',
    });
  });

  it('skips rows without a token id', () => {
    expect(toProfileCreatedPeek({ tokenId: '  ' })).toBeNull();
  });
});
