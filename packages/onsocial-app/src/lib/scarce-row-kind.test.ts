import { describe, expect, it } from 'vitest';
import { scarceRowFormatLabel, scarceRowPartyLead } from './scarce-row-kind';

describe('scarceRowFormatLabel', () => {
  it('prefers audio release format over generic Audio', () => {
    expect(
      scarceRowFormatLabel({ mediumKind: 'audio', audioFormat: 'album' })
    ).toBe('Album');
    expect(
      scarceRowFormatLabel({ mediumKind: 'music', audioFormat: 'single' })
    ).toBe('Single');
    expect(
      scarceRowFormatLabel({ mediumKind: 'audio', audioFormat: 'podcast' })
    ).toBe('Podcast');
    expect(
      scarceRowFormatLabel({ mediumKind: 'audio', audioFormat: 'audiobook' })
    ).toBe('Audiobook');
  });

  it('maps writing medium and book/issue formats', () => {
    expect(scarceRowFormatLabel({ mediumKind: 'writing' })).toBe('Writing');
    expect(
      scarceRowFormatLabel({ mediumKind: 'writing', writingFormat: 'book' })
    ).toBe('Book');
    expect(
      scarceRowFormatLabel({ mediumKind: 'writing', writingFormat: 'issue' })
    ).toBe('Issue');
  });

  it('singularizes ticket and other filter labels', () => {
    expect(scarceRowFormatLabel({ mediumKind: 'ticket' })).toBe('Ticket');
    expect(scarceRowFormatLabel({ mediumKind: 'art' })).toBe('Art');
  });

  it('returns null when kind is unknown', () => {
    expect(scarceRowFormatLabel({ mediumKind: null })).toBeNull();
  });
});

describe('scarceRowPartyLead', () => {
  it('puts the format on the creator stamp', () => {
    expect(
      scarceRowPartyLead({ mediumKind: 'audio', audioFormat: 'album' })
    ).toBe('Album by');
    expect(scarceRowPartyLead({ mediumKind: 'ticket' })).toBe('Ticket by');
    expect(scarceRowPartyLead({ mediumKind: 'thought' })).toBe('Thought by');
    expect(scarceRowPartyLead({ mediumKind: null })).toBe('by');
  });

  it('keeps commerce and series verbs role-only', () => {
    expect(
      scarceRowPartyLead(
        { mediumKind: 'audio', audioFormat: 'album' },
        { role: 'listed' }
      )
    ).toBe('Listed by');
    expect(
      scarceRowPartyLead({ mediumKind: 'ticket' }, { role: 'bought' })
    ).toBe('Bought by');
    expect(scarceRowPartyLead({}, { role: 'series' })).toBe('Series by');
  });

  it('uses Event by on the events catalog and omits kind when asked', () => {
    expect(
      scarceRowPartyLead({ mediumKind: 'ticket' }, { voice: 'event' })
    ).toBe('Event by');
    expect(
      scarceRowPartyLead(
        { mediumKind: 'audio', audioFormat: 'podcast' },
        { omitKind: true }
      )
    ).toBe('by');
  });
});
