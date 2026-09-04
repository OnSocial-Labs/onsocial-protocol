import { describe, expect, it } from 'vitest';
import {
  PROFILE_BIO_FACE_LINES,
  FACE_BIO_WRAP_CHARS,
  clampProfileBioFaceLines,
  joinProfileBioFaceAbout,
  partitionFaceAboutInput,
  portfolioAboutPrintUrl,
  profileAboutHasMoreThanFace,
  profileBioFace,
  profileBioHasLineOverflow,
  profileBioLines,
  resolvePortfolioAboutBio,
  splitProfileBioFaceAbout,
} from './profile-bio-face';

describe('profileBioLines', () => {
  it('splits on newlines and normalizes CRLF', () => {
    expect(profileBioLines('one\r\ntwo\nthree')).toEqual([
      'one',
      'two',
      'three',
    ]);
  });
});

describe('profileBioFace', () => {
  it('keeps a short bio intact', () => {
    expect(profileBioFace('Hello from Alice.')).toBe('Hello from Alice.');
  });

  it('clamps to the first four lines', () => {
    const bio = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n');
    expect(profileBioFace(bio)).toBe('one\ntwo\nthree\nfour');
    expect(PROFILE_BIO_FACE_LINES).toBe(4);
  });
});

describe('profileBioHasLineOverflow', () => {
  it('is false at four lines and true at five', () => {
    expect(profileBioHasLineOverflow('a\nb\nc\nd')).toBe(false);
    expect(profileBioHasLineOverflow('a\nb\nc\nd\ne')).toBe(true);
  });
});

describe('split/joinProfileBioFaceAbout', () => {
  it('round-trips a multi-line bio', () => {
    const bio = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n');
    const split = splitProfileBioFaceAbout(bio);
    expect(split.face).toBe('one\ntwo\nthree\nfour');
    expect(split.about).toBe('five\nsix');
    expect(joinProfileBioFaceAbout(split.face, split.about)).toBe(bio);
  });

  it('clamps face edits to four lines', () => {
    expect(clampProfileBioFaceLines('a\nb\nc\nd\ne')).toBe('a\nb\nc\nd');
  });

  it('joins a short face with about continuation', () => {
    expect(joinProfileBioFaceAbout('Hello', 'More on About.')).toBe(
      'Hello\nMore on About.'
    );
  });
});

describe('partitionFaceAboutInput', () => {
  it('spills lines past the face budget into About', () => {
    const next = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n');
    const result = partitionFaceAboutInput(next, '');
    expect(result.face).toBe('one\ntwo\nthree\nfour');
    expect(result.about).toBe('five\nsix');
    expect(result.spilled).toBe(true);
  });

  it('spills a long single paragraph by wrap budget', () => {
    const next =
      'I’m an entrepreneur, builder and lifelong learner focused on creating technology that brings people together and turns ideas into meaningful action. I believe technology should feel human.';
    const result = partitionFaceAboutInput(next, '');
    expect(result.spilled).toBe(true);
    expect(result.face.length).toBeLessThanOrEqual(FACE_BIO_WRAP_CHARS + 1);
    expect(result.about.startsWith('I believe') || result.about.length > 0).toBe(
      true
    );
    expect(result.face.includes(result.about.slice(0, 12))).toBe(false);
  });

  it('prepends spill ahead of existing About', () => {
    const result = partitionFaceAboutInput(
      ['a', 'b', 'c', 'd', 'e'].join('\n'),
      'Already here.'
    );
    expect(result.face).toBe('a\nb\nc\nd');
    expect(result.about).toBe('e\nAlready here.');
  });

  it('leaves a short face alone', () => {
    const result = partitionFaceAboutInput('Builder in Lisbon.', 'Extra.');
    expect(result.face).toBe('Builder in Lisbon.');
    expect(result.about).toBe('Extra.');
    expect(result.spilled).toBe(false);
  });

  it('keeps trailing Enter newlines on a short face', () => {
    const result = partitionFaceAboutInput('Hello\n\n', '');
    expect(result.face).toBe('Hello\n\n');
    expect(result.spilled).toBe(false);
  });
});

describe('profileAboutHasMoreThanFace', () => {
  it('hides About when face and about are the same short bio', () => {
    expect(
      profileAboutHasMoreThanFace({
        faceText: 'Builder in Lisbon.',
        aboutText: 'Builder in Lisbon.',
      })
    ).toBe(false);
  });

  it('shows About when tagline hides a longer bio', () => {
    expect(
      profileAboutHasMoreThanFace({
        faceText: 'Builder',
        aboutText: 'Builder\n\nI write about cities and sound.',
      })
    ).toBe(true);
  });

  it('shows About when a single block would wrap past four face lines', () => {
    const about = 'OnSocial is a place for people who make things with other people. '.repeat(
      4
    );
    expect(
      profileAboutHasMoreThanFace({
        faceText: about,
        aboutText: about,
      })
    ).toBe(true);
  });

  it('shows About when the bio has more than four lines', () => {
    const about = ['a', 'b', 'c', 'd', 'e'].join('\n');
    expect(
      profileAboutHasMoreThanFace({
        faceText: about,
        aboutText: about,
      })
    ).toBe(true);
  });

  it('hides About when there is no about body', () => {
    expect(
      profileAboutHasMoreThanFace({
        faceText: 'Hello',
        aboutText: '  ',
      })
    ).toBe(false);
  });

  it('shows About when photos exist even without a longer bio', () => {
    expect(
      profileAboutHasMoreThanFace({
        faceText: 'Hello',
        aboutText: 'Hello',
        photoCount: 1,
      })
    ).toBe(true);
  });

  it('shows About when topics exist even without a longer bio', () => {
    expect(
      profileAboutHasMoreThanFace({
        faceText: 'Hello',
        aboutText: 'Hello',
        tagCount: 2,
      })
    ).toBe(true);
  });
});

describe('resolvePortfolioAboutBio', () => {
  it('prefers profile bio over dao purpose and skips empty tagline-like fallbacks', () => {
    expect(
      resolvePortfolioAboutBio({
        shellBio: '  From the profile.  ',
        daoDescription: 'Catalog blurb',
        daoPurpose: 'Sputnik purpose',
      })
    ).toBe('From the profile.');
    expect(
      resolvePortfolioAboutBio({
        shellBio: ' ',
        daoDescription: null,
        daoPurpose: 'A purpose.',
      })
    ).toBe('A purpose.');
    expect(
      resolvePortfolioAboutBio({
        shellBio: null,
        daoDescription: null,
        daoPurpose: null,
      })
    ).toBeNull();
  });
});

describe('portfolioAboutPrintUrl', () => {
  it('keeps a real photo and drops empty plates', () => {
    expect(portfolioAboutPrintUrl(' https://cdn.example/a.jpg ')).toBe(
      'https://cdn.example/a.jpg'
    );
    expect(portfolioAboutPrintUrl('')).toBeNull();
    expect(portfolioAboutPrintUrl(null)).toBeNull();
  });
});
