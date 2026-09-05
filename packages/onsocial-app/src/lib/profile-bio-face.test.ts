import { describe, expect, it } from 'vitest';
import {
  PROFILE_BIO_FACE_LINES,
  PROFILE_BIO_FACE_ABOUT_MARK,
  FACE_BIO_WRAP_CHARS,
  clampFaceEditorInput,
  clampProfileBioFaceLines,
  collapseProfileBioBlankLines,
  joinProfileBioFaceAbout,
  partitionFaceAboutInput,
  portfolioAboutPrintUrl,
  profileAboutHasMoreThanFace,
  profileBioFace,
  profileBioHasLineOverflow,
  profileBioLines,
  resolvePortfolioAboutBio,
  resolveStoredProfileFaceAbout,
  splitProfileBioFaceAbout,
} from './profile-bio-face';

function faceFlatLen(text: string): number {
  return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().length;
}

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
  it('round-trips a multi-line bio with an invisible mark', () => {
    const face = 'one\ntwo\nthree\nfour';
    const about = 'five\nsix';
    const joined = joinProfileBioFaceAbout(face, about);
    expect(joined).toContain(PROFILE_BIO_FACE_ABOUT_MARK);
    expect(splitProfileBioFaceAbout(joined)).toEqual({ face, about });
  });

  it('clamps face edits to four lines', () => {
    expect(clampProfileBioFaceLines('a\nb\nc\nd\ne')).toBe('a\nb\nc\nd');
  });

  it('keeps a short face out of the About continuation', () => {
    const joined = joinProfileBioFaceAbout('Hello', 'More on About.\nEssay.');
    expect(splitProfileBioFaceAbout(joined)).toEqual({
      face: 'Hello',
      about: 'More on About.\nEssay.',
    });
    expect(joined.includes('\n\n\n')).toBe(false);
  });

  it('round-trips an empty face with About-only copy', () => {
    const joined = joinProfileBioFaceAbout('', '# Work\nThe essay.');
    expect(splitProfileBioFaceAbout(joined)).toEqual({
      face: '',
      about: '# Work\nThe essay.',
    });
  });

  it('reads legacy padded joins without opening a blank gap', () => {
    expect(
      splitProfileBioFaceAbout('Hello\n\n\n\nMore on About.\nEssay.')
    ).toEqual({
      face: 'Hello',
      about: 'More on About.\nEssay.',
    });
  });
});

describe('clampFaceEditorInput', () => {
  it('keeps in-budget text exact (no rewrite)', () => {
    expect(clampFaceEditorInput('Builder in Lisbon.\n')).toBe(
      'Builder in Lisbon.\n'
    );
  });

  it('cuts a long paragraph to the face budget without needing About', () => {
    const next =
      'I’m an entrepreneur, builder and lifelong learner focused on creating technology that brings people together and turns ideas into meaningful action. I believe technology should feel human.';
    const face = clampFaceEditorInput(next);
    expect(faceFlatLen(face)).toBeLessThanOrEqual(FACE_BIO_WRAP_CHARS);
    expect(face.length).toBeLessThan(next.length);
  });

  it('keeps the ~150 character entrepreneur sample', () => {
    const sample =
      "I'm an entrepreneur, builder and lifelong learner focused on creating technology that brings people together and turns ideas into meaningful action.";
    expect(sample.length).toBeLessThanOrEqual(FACE_BIO_WRAP_CHARS);
    expect(clampFaceEditorInput(sample)).toBe(sample);
  });

  it('clamps Enter towers by the soft line ceiling', () => {
    expect(clampFaceEditorInput('Hello\n\n\n\n\nfrom paste.')).toBe(
      'Hello\n\n\n'
    );
  });
});

describe('partitionFaceAboutInput', () => {
  it('does not move face overflow into About', () => {
    const next = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n');
    const result = partitionFaceAboutInput(next, 'Already here.');
    expect(result.face).toBe('one\ntwo\nthree\nfour');
    expect(result.about).toBe('Already here.');
    expect(result.spilled).toBe(true);
  });

  it('leaves a short face and existing About alone', () => {
    const result = partitionFaceAboutInput('Builder in Lisbon.', 'Extra.');
    expect(result.face).toBe('Builder in Lisbon.');
    expect(result.about).toBe('Extra.');
    expect(result.spilled).toBe(false);
  });
});

describe('collapseProfileBioBlankLines', () => {
  it('drops leading blanks and caps runs at one empty line', () => {
    expect(collapseProfileBioBlankLines('\n\nHi\n\n\n\nthere\n\n\n')).toBe(
      'Hi\n\nthere\n\n'
    );
  });
});

describe('profileAboutHasMoreThanFace', () => {
  it('shows About when More for About is set, even if it matches the face', () => {
    expect(
      profileAboutHasMoreThanFace({
        aboutText: 'Builder in Lisbon.',
      })
    ).toBe(true);
  });

  it('hides About when only the face bio is set', () => {
    expect(
      profileAboutHasMoreThanFace({
        aboutText: '  ',
      })
    ).toBe(false);
  });

  it('shows About when photos exist even without an essay', () => {
    expect(
      profileAboutHasMoreThanFace({
        aboutText: '',
        photoCount: 1,
      })
    ).toBe(true);
  });

  it('shows About when a lead exists', () => {
    expect(
      profileAboutHasMoreThanFace({
        aboutText: '',
        leadText: 'Our story',
      })
    ).toBe(true);
  });

  it('shows About when crafts are set', () => {
    expect(
      profileAboutHasMoreThanFace({
        aboutText: '',
        tagCount: 2,
      })
    ).toBe(true);
  });
});

describe('resolveStoredProfileFaceAbout', () => {
  it('trusts split keys when about has content', () => {
    expect(
      resolveStoredProfileFaceAbout('Face only.', '# Work\nThe essay.')
    ).toEqual({
      face: 'Face only.',
      about: '# Work\nThe essay.',
    });
  });

  it('peels a legacy joined bio when about is empty', () => {
    expect(
      resolveStoredProfileFaceAbout(
        'Hello\n\n\n\nMore on About.\nEssay.',
        ''
      )
    ).toEqual({
      face: 'Hello',
      about: 'More on About.\nEssay.',
    });
  });
});

describe('resolvePortfolioAboutBio', () => {
  it('prefers profile face + about over dao purpose', () => {
    expect(
      resolvePortfolioAboutBio({
        shellBio: '  From the profile.  ',
        shellAbout: 'More.',
        daoDescription: 'Catalog blurb',
        daoPurpose: 'Sputnik purpose',
      })
    ).toBe('From the profile.\nMore.');
    expect(
      resolvePortfolioAboutBio({
        shellBio: ' ',
        shellAbout: null,
        daoDescription: null,
        daoPurpose: 'A purpose.',
      })
    ).toBe('A purpose.');
    expect(
      resolvePortfolioAboutBio({
        shellBio: null,
        shellAbout: null,
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
