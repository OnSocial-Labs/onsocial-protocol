import { describe, expect, it } from 'vitest';
import { dropStartConfirmCopy } from '@/features/scarces/drop-start-confirm-sheet';

describe('dropStartConfirmCopy', () => {
  it('speaks start, not list', () => {
    expect(dropStartConfirmCopy('review').title).toBe('Drop summary');
    expect(dropStartConfirmCopy('review').primaryLabel).toBe('Start drop');
    expect(dropStartConfirmCopy('ready')).toEqual({
      title: 'Ready to start',
      status: 'Media ready — confirm in your wallet to start.',
      primaryLabel: 'Confirm in wallet',
    });
    expect(dropStartConfirmCopy('listing').title).toBe('Confirm in wallet');
  });
});
