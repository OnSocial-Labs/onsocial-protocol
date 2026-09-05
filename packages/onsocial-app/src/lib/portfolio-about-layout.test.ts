import { describe, expect, it } from 'vitest';
import {
  resolvePortfolioAboutCopy,
  resolvePortfolioAboutFilmLead,
  resolvePortfolioAboutIndustryLabel,
  resolvePortfolioAboutStills,
  aboutStillAlt,
  shouldShowPortfolioAboutFaceLede,
  shouldShowPortfolioAboutName,
  shouldShowPortfolioAboutWork,
} from './portfolio-about-layout';

describe('aboutStillAlt', () => {
  it('uses the name alone for a single still', () => {
    expect(aboutStillAlt('Maya Chen', 0, 1)).toBe('Maya Chen');
  });

  it('numbers stills in a set', () => {
    expect(aboutStillAlt('Maya Chen', 1, 3)).toBe('Maya Chen, 2 of 3');
  });
});

describe('resolvePortfolioAboutStills', () => {
  it('uses the first photo as the print and the rest as the film', () => {
    const layout = resolvePortfolioAboutStills({
      titleLabel: 'Maya',
      photos: [
        { url: 'https://cdn.example/one.jpg' },
        { url: 'https://cdn.example/two.jpg' },
        { url: 'https://cdn.example/three.jpg' },
      ],
    });
    expect(layout.print?.url).toBe('https://cdn.example/one.jpg');
    expect(layout.film.map((still) => still.url)).toEqual([
      'https://cdn.example/two.jpg',
      'https://cdn.example/three.jpg',
    ]);
    expect(layout.viewer).toHaveLength(3);
    expect(layout.viewer[0]?.alt).toBe('Maya, 1 of 3');
  });

  it('does not use the face avatar as a print', () => {
    expect(
      resolvePortfolioAboutStills({
        titleLabel: 'Maya',
        photos: [],
      })
    ).toEqual({ print: null, film: [], viewer: [] });
  });
});

describe('resolvePortfolioAboutCopy', () => {
  it('splits page bio from More for About', () => {
    expect(
      resolvePortfolioAboutCopy({
        bio: 'One.\nTwo.\nThree.\nFour.',
        about: '# Work\nThe essay.',
      })
    ).toEqual({
      intro: [{ type: 'paragraph', text: 'One.\nTwo.\nThree.\nFour.' }],
      rest: [
        { type: 'heading', text: 'Work' },
        { type: 'paragraph', text: 'The essay.' },
      ],
      essay: [
        { type: 'paragraph', text: 'One.\nTwo.\nThree.\nFour.' },
        { type: 'heading', text: 'Work' },
        { type: 'paragraph', text: 'The essay.' },
      ],
    });
  });

  it('keeps a short page bio available when there is no continuation', () => {
    expect(
      resolvePortfolioAboutCopy({ bio: 'Just the face lines.' })
    ).toEqual({
      intro: [{ type: 'paragraph', text: 'Just the face lines.' }],
      rest: [],
      essay: [{ type: 'paragraph', text: 'Just the face lines.' }],
    });
  });

  it('soft-migrates a legacy joined bio when about is empty', () => {
    expect(
      resolvePortfolioAboutCopy({
        bio: 'One.\nTwo.\nThree.\nFour.\n# Work\nThe essay.',
      })
    ).toEqual({
      intro: [{ type: 'paragraph', text: 'One.\nTwo.\nThree.\nFour.' }],
      rest: [
        { type: 'heading', text: 'Work' },
        { type: 'paragraph', text: 'The essay.' },
      ],
      essay: [
        { type: 'paragraph', text: 'One.\nTwo.\nThree.\nFour.' },
        { type: 'heading', text: 'Work' },
        { type: 'paragraph', text: 'The essay.' },
      ],
    });
  });
});

describe('resolvePortfolioAboutFilmLead', () => {
  it('shows the lead centered above film stills', () => {
    expect(
      resolvePortfolioAboutFilmLead({
        lead: 'Our story',
        filmCount: 2,
      })
    ).toBe('Our story');
  });

  it('hides the lead when there is no film', () => {
    expect(
      resolvePortfolioAboutFilmLead({
        lead: 'Our story',
        filmCount: 0,
      })
    ).toBeNull();
  });

  it('ignores blank lead', () => {
    expect(
      resolvePortfolioAboutFilmLead({
        lead: '  ',
        filmCount: 1,
      })
    ).toBeNull();
  });
});

describe('shouldShowPortfolioAboutWork', () => {
  it('hides the closer on an empty About', () => {
    expect(
      shouldShowPortfolioAboutWork({ hasEssay: false, stillCount: 0 })
    ).toBe(false);
  });

  it('shows the closer when there is a story or stills', () => {
    expect(
      shouldShowPortfolioAboutWork({ hasEssay: true, stillCount: 0 })
    ).toBe(true);
    expect(
      shouldShowPortfolioAboutWork({ hasEssay: false, stillCount: 2 })
    ).toBe(true);
  });
});

describe('shouldShowPortfolioAboutName', () => {
  it('always shows the name on About', () => {
    expect(shouldShowPortfolioAboutName()).toBe(true);
  });
});

describe('resolvePortfolioAboutIndustryLabel', () => {
  it('echoes a set industry for org and DAO', () => {
    expect(
      resolvePortfolioAboutIndustryLabel({
        kind: 'org',
        industry: '  Music  ',
      })
    ).toBe('Music');
    expect(
      resolvePortfolioAboutIndustryLabel({
        kind: 'dao',
        industry: 'Film',
      })
    ).toBe('Film');
  });

  it('hides the Organization fallback and blank industry', () => {
    expect(
      resolvePortfolioAboutIndustryLabel({ kind: 'org', industry: '' })
    ).toBeNull();
    expect(
      resolvePortfolioAboutIndustryLabel({ kind: 'dao', industry: '   ' })
    ).toBeNull();
    expect(
      resolvePortfolioAboutIndustryLabel({ kind: 'org' })
    ).toBeNull();
  });

  it('keeps industry off person About', () => {
    expect(
      resolvePortfolioAboutIndustryLabel({
        kind: 'person',
        industry: 'Music',
      })
    ).toBeNull();
  });
});

describe('shouldShowPortfolioAboutFaceLede', () => {
  it('echoes the face bio only when the room has no story and no stills', () => {
    expect(
      shouldShowPortfolioAboutFaceLede({
        hasContinuation: false,
        stillCount: 0,
      })
    ).toBe(true);
  });

  it('hides the face bio when there is More for About or stills', () => {
    expect(
      shouldShowPortfolioAboutFaceLede({
        hasContinuation: true,
        stillCount: 0,
      })
    ).toBe(false);
    expect(
      shouldShowPortfolioAboutFaceLede({
        hasContinuation: false,
        stillCount: 1,
      })
    ).toBe(false);
  });
});
