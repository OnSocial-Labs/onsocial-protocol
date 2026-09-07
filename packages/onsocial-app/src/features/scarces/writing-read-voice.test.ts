import { describe, expect, it } from 'vitest';
import {
  writingReadLockedHint,
  writingUntitledLabel,
} from '@/features/scarces/writing-read-voice';

describe('writingReadLockedHint', () => {
  it('asks Connect or Collect, not wallet or unlock', () => {
    expect(
      writingReadLockedHint({ isConnected: false, holdsEdition: false })
    ).toBe('Connect to read.');
    expect(
      writingReadLockedHint({ isConnected: true, holdsEdition: null })
    ).toBe('Checking your edition…');
    expect(
      writingReadLockedHint({ isConnected: true, holdsEdition: false })
    ).toBe('Collect an edition to read.');
  });
});

describe('writingUntitledLabel', () => {
  it('says Writing, not Manuscript', () => {
    expect(writingUntitledLabel()).toBe('Writing');
    expect(writingUntitledLabel({ isPdf: true })).toBe('PDF');
  });
});
