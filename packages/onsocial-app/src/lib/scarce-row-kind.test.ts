import { describe, expect, it } from 'vitest';
import { scarceRowFormatLabel } from './scarce-row-kind';

describe('scarceRowFormatLabel', () => {
  it('prefers audio release format over generic Audio', () => {
    expect(
      scarceRowFormatLabel({ mediumKind: 'audio', audioFormat: 'album' })
    ).toBe('Album');
    expect(
      scarceRowFormatLabel({ mediumKind: 'music', audioFormat: 'single' })
    ).toBe('Single');
  });

  it('maps writing medium and book/article formats', () => {
    expect(scarceRowFormatLabel({ mediumKind: 'writing' })).toBe('Writing');
    expect(
      scarceRowFormatLabel({ mediumKind: 'writing', writingFormat: 'book' })
    ).toBe('Book');
  });

  it('singularizes ticket and other filter labels', () => {
    expect(scarceRowFormatLabel({ mediumKind: 'ticket' })).toBe('Ticket');
    expect(scarceRowFormatLabel({ mediumKind: 'art' })).toBe('Art');
  });

  it('returns null when kind is unknown', () => {
    expect(scarceRowFormatLabel({ mediumKind: null })).toBeNull();
  });
});
