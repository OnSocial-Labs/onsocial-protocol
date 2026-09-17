import { describe, expect, it } from 'vitest';
import { writingUntitledLabel } from '@/features/scarces/writing-read-voice';

describe('writingUntitledLabel', () => {
  it('says Writing, not Manuscript', () => {
    expect(writingUntitledLabel()).toBe('Writing');
    expect(writingUntitledLabel({ isPdf: true })).toBe('PDF');
  });
});
