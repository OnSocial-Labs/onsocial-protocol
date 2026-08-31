import { describe, expect, it } from 'vitest';
import {
  endorsementFocusMatchesPage,
  endorsementFocusSharePath,
  expandEndorsementFocus,
  matchEndorsementFocusItem,
} from './endorsement-focus';

const design = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  issuer: 'bob.testnet',
  target: 'alice.testnet',
  topic: 'design',
};

const rust = {
  id: null,
  issuer: 'bob.testnet',
  target: 'alice.testnet',
  topic: 'rust',
};

const other = {
  id: 'aaaaaaa1-e29b-41d4-a716-446655440000',
  issuer: 'carol.testnet',
  target: 'alice.testnet',
  topic: 'design',
};

describe('expandEndorsementFocus', () => {
  it('reads issuer and topic from a legacy spend id', () => {
    expect(
      expandEndorsementFocus({
        id: 'legacy:bob.testnet:alice.testnet:design',
        issuer: null,
        topic: null,
      })
    ).toEqual({
      id: 'legacy:bob.testnet:alice.testnet:design',
      uuid: null,
      issuer: 'bob.testnet',
      topic: 'design',
      legacyTarget: 'alice.testnet',
    });
  });

  it('keeps a UUID and explicit issuer', () => {
    expect(
      expandEndorsementFocus({
        id: design.id,
        issuer: 'bob.testnet',
        topic: null,
      })
    ).toMatchObject({
      uuid: design.id,
      issuer: 'bob.testnet',
      topic: null,
    });
  });
});

describe('endorsementFocusMatchesPage', () => {
  it('rejects a legacy id aimed at another face', () => {
    expect(
      endorsementFocusMatchesPage('alice.testnet', {
        id: 'legacy:bob.testnet:carol.testnet:design',
        issuer: null,
        topic: null,
      })
    ).toBe(false);
    expect(
      endorsementFocusMatchesPage('alice.testnet', {
        id: 'legacy:bob.testnet:alice.testnet:design',
        issuer: null,
        topic: null,
      })
    ).toBe(true);
  });
});

describe('matchEndorsementFocusItem', () => {
  const items = [design, rust, other];

  it('matches UUID when present', () => {
    expect(
      matchEndorsementFocusItem(items, {
        id: design.id,
        issuer: 'bob.testnet',
        topic: null,
      })
    ).toBe(design);
  });

  it('matches issuer + topic', () => {
    expect(
      matchEndorsementFocusItem(items, {
        id: null,
        issuer: 'bob.testnet',
        topic: 'Rust',
      })
    ).toBe(rust);
  });

  it('falls back to the issuer’s first row', () => {
    expect(
      matchEndorsementFocusItem(items, {
        id: null,
        issuer: 'bob.testnet',
        topic: null,
      })
    ).toBe(design);
  });
});

describe('endorsementFocusSharePath', () => {
  it('prefers the UUID spend id and keeps issuer', () => {
    expect(endorsementFocusSharePath(design)).toBe(
      '/@alice.testnet?endorsement=550e8400-e29b-41d4-a716-446655440000&issuer=bob.testnet'
    );
  });

  it('uses a legacy spend id when there is no UUID', () => {
    expect(endorsementFocusSharePath(rust)).toBe(
      '/@alice.testnet?endorsement=legacy%3Abob.testnet%3Aalice.testnet%3Arust'
    );
  });
});
