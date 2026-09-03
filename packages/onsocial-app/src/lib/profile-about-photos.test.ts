import { describe, expect, it } from 'vitest';
import {
  PROFILE_ABOUT_PHOTOS_MAX,
  moveProfileAboutPhoto,
  parseProfileAboutPhotoRefs,
  profileAboutPhotoRefsEqual,
  profileAboutPhotosFromStored,
} from './profile-about-photos';

describe('parseProfileAboutPhotoRefs', () => {
  it('reads a JSON array and caps at three', () => {
    expect(
      parseProfileAboutPhotoRefs(
        JSON.stringify([
          'ipfs://one',
          '  ipfs://two  ',
          '',
          'ipfs://three',
          'ipfs://four',
        ])
      )
    ).toEqual(['ipfs://one', 'ipfs://two', 'ipfs://three']);
    expect(PROFILE_ABOUT_PHOTOS_MAX).toBe(3);
  });

  it('reads an already-parsed array', () => {
    expect(parseProfileAboutPhotoRefs(['ipfs://a', 2, null])).toEqual([
      'ipfs://a',
    ]);
  });

  it('drops junk', () => {
    expect(parseProfileAboutPhotoRefs('not-json')).toEqual([]);
    expect(parseProfileAboutPhotoRefs(null)).toEqual([]);
  });
});

describe('profileAboutPhotosFromStored', () => {
  it('resolves ipfs refs to the CDN', () => {
    expect(
      profileAboutPhotosFromStored(['ipfs://bafyAbout'], null)
    ).toEqual([
      {
        ref: 'ipfs://bafyAbout',
        url: 'https://cdn.testnet.onsocial.id/ipfs/bafyAbout',
      },
    ]);
  });

  it('reads extra.photos when the typed field is empty', () => {
    expect(
      profileAboutPhotosFromStored(null, JSON.stringify(['https://cdn.example/a.jpg']))
    ).toEqual([{ ref: 'https://cdn.example/a.jpg', url: 'https://cdn.example/a.jpg' }]);
  });
});

describe('profileAboutPhotoRefsEqual', () => {
  it('compares order and values', () => {
    expect(profileAboutPhotoRefsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(profileAboutPhotoRefsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

describe('moveProfileAboutPhoto', () => {
  it('moves an item and keeps the rest in order', () => {
    expect(moveProfileAboutPhoto(['a', 'b', 'c'], 0, 2)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(moveProfileAboutPhoto(['a', 'b', 'c'], 2, 0)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(moveProfileAboutPhoto(['a', 'b', 'c'], 1, 1)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
