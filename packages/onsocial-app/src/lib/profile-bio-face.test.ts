import { describe, expect, it } from 'vitest';
import {
  PROFILE_BIO_FACE_LINES,
  profileAboutHasMoreThanFace,
  profileBioFace,
  profileBioHasLineOverflow,
  profileBioLines,
  resolvePortfolioAboutBio,
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
