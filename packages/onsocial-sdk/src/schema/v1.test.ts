import { describe, expect, it } from 'vitest';
import {
  REACTION_KINDS,
  SCHEMA_VERSION,
  attestationV1,
  endorsementV1,
  groupConfigV1,
  postV1,
  profileV1,
  reactionV1,
  saveV1,
  standingV1,
  validateAttestationV1,
  validateEndorsementV1,
  validateGroupConfigV1,
  validatePostV1,
  validateProfileV1,
  validateReactionV1,
  validateSaveV1,
  validateStandingV1,
} from './v1.js';

describe('schema v1 — versioning', () => {
  it('SCHEMA_VERSION is 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});

describe('ProfileV1', () => {
  it('accepts a minimal valid profile', () => {
    const p = profileV1({});
    expect(p.v).toBe(1);
    expect(validateProfileV1(p)).toBeNull();
  });

  it('accepts full profile with media + extensions', () => {
    const p = profileV1({
      handle: 'alice_42',
      displayName: 'Alice',
      bio: 'Building',
      avatar: {
        cid: 'bafy...',
        mime: 'image/webp',
        width: 256,
        height: 256,
        alt: 'Alice',
      },
      links: [{ label: 'Site', url: 'https://x.test' }],
      tags: ['near', 'web3'],
      lang: 'en',
      x: { dating: { orientation: 'queer' } },
    });
    expect(validateProfileV1(p)).toBeNull();
  });

  it('rejects bad handle', () => {
    expect(() => profileV1({ handle: 'WithUpper' })).toThrow(/handle/);
    expect(() => profileV1({ handle: 'bad name' })).toThrow(/handle/);
  });

  it('rejects bad lang and bad media', () => {
    expect(() => profileV1({ lang: '!' })).toThrow(/lang/);
    expect(() =>
      profileV1({ avatar: { cid: '', mime: 'image/png' } as never })
    ).toThrow(/avatar/);
  });

  it('rejects bad extension namespace', () => {
    expect(() => profileV1({ x: { 'bad ns': { foo: 1 } } as never })).toThrow(
      /x.bad ns/
    );
  });
});

describe('PostV1', () => {
  it('builds with default timestamp', () => {
    const p = postV1({ text: 'hello' });
    expect(p.v).toBe(1);
    expect(typeof p.timestamp).toBe('number');
    expect(validatePostV1(p)).toBeNull();
  });

  it('accepts mentions / hashtags / media / embeds / refs', () => {
    const p = postV1({
      text: 'hi @bob #web3',
      contentType: 'md',
      lang: 'en',
      media: [{ cid: 'bafy', mime: 'image/png' }],
      mentions: ['bob.near'],
      hashtags: ['web3', 'near'],
      embeds: [{ kind: 'link', url: 'https://x.test', title: 'X' }],
      parent: 'alice.near/post/main',
      parentType: 'post',
      access: 'public',
      timestamp: 7,
    });
    expect(validatePostV1(p)).toBeNull();
    expect(p.timestamp).toBe(7);
  });

  it('rejects uppercase hashtags and bad parentType / refType', () => {
    expect(() => postV1({ text: 'x', hashtags: ['BadTag'] })).toThrow(
      /hashtags/
    );
    expect(() => postV1({ text: 'x', parentType: 'reply' as never })).toThrow(
      /parentType/
    );
    expect(() => postV1({ text: 'x', refType: 'mirror' as never })).toThrow(
      /refType/
    );
  });

  it('rejects unknown embed kinds', () => {
    expect(() =>
      postV1({
        text: 'x',
        embeds: [{ kind: 'video', url: 'x' } as never],
      })
    ).toThrow(/embeds/);
  });
});

describe('ReactionV1', () => {
  it('accepts every kind in the controlled vocab', () => {
    for (const type of REACTION_KINDS) {
      const r = reactionV1({ type });
      expect(validateReactionV1(r)).toBeNull();
    }
  });

  it('rejects out-of-vocab type', () => {
    expect(() => reactionV1({ type: 'angry' as never })).toThrow(
      /reaction.type/
    );
  });

  it('allows custom emoji escape hatch', () => {
    const r = reactionV1({ type: 'love', emoji: '🦄' });
    expect(r.emoji).toBe('🦄');
  });
});

describe('StandingV1', () => {
  it('builds with default since', () => {
    const s = standingV1({});
    expect(s.v).toBe(1);
    expect(typeof s.since).toBe('number');
  });

  it('supports note + expiresAt', () => {
    const s = standingV1({ since: 1, note: 'mentor', expiresAt: 99 });
    expect(validateStandingV1(s)).toBeNull();
  });
});

describe('GroupConfigV1', () => {
  it('requires name and isPrivate', () => {
    const g = groupConfigV1({ name: 'Builders', isPrivate: false });
    expect(validateGroupConfigV1(g)).toBeNull();
  });

  it('rejects missing name', () => {
    expect(() => groupConfigV1({ isPrivate: false } as never)).toThrow(/name/);
  });
});

describe('SaveV1', () => {
  it('builds with default timestamp', () => {
    const s = saveV1({ folder: 'recipes' });
    expect(s.v).toBe(1);
    expect(typeof s.timestamp).toBe('number');
    expect(s.folder).toBe('recipes');
    expect(validateSaveV1(s)).toBeNull();
  });

  it('rejects missing timestamp on raw object', () => {
    expect(validateSaveV1({ v: 1 })).toMatch(/timestamp/);
  });

  it('rejects wrong types', () => {
    expect(validateSaveV1({ v: 1, timestamp: 1, folder: 5 })).toMatch(/folder/);
  });
});

describe('EndorsementV1', () => {
  it('accepts minimal', () => {
    const e = endorsementV1({});
    expect(e.v).toBe(1);
    expect(typeof e.since).toBe('number');
    expect(validateEndorsementV1(e)).toBeNull();
  });

  it('accepts topic + weight', () => {
    const e = endorsementV1({ topic: 'rust', weight: 5, note: 'great' });
    expect(e.weight).toBe(5);
    expect(validateEndorsementV1(e)).toBeNull();
  });

  it('rejects out-of-range weight', () => {
    expect(validateEndorsementV1({ v: 1, since: 1, weight: 7 })).toMatch(
      /weight/
    );
    expect(validateEndorsementV1({ v: 1, since: 1, weight: 0 })).toMatch(
      /weight/
    );
  });
});

describe('AttestationV1', () => {
  it('accepts minimal', () => {
    const a = attestationV1({ type: 'verified', subject: 'alice.near' });
    expect(a.v).toBe(1);
    expect(a.type).toBe('verified');
    expect(typeof a.issuedAt).toBe('number');
    expect(validateAttestationV1(a)).toBeNull();
  });

  it('accepts evidence + signature + metadata', () => {
    const a = attestationV1({
      type: 'kyc-passed',
      subject: 'merchant.near',
      scope: 'sku-42',
      expiresAt: Date.now() + 86_400_000,
      evidence: [{ cid: 'bafy...', mime: 'application/pdf' }],
      metadata: { tier: 'gold' },
      signature: { alg: 'ed25519', sig: 'AAAA', signer: 'issuer.near' },
    });
    expect(validateAttestationV1(a)).toBeNull();
  });

  it('rejects bad type pattern', () => {
    expect(
      validateAttestationV1({
        v: 1,
        type: 'BAD TYPE!',
        subject: 'x',
        issuedAt: 1,
      })
    ).toMatch(/type/);
    expect(
      validateAttestationV1({
        v: 1,
        type: '-leading',
        subject: 'x',
        issuedAt: 1,
      })
    ).toMatch(/type/);
  });

  it('rejects missing subject', () => {
    expect(
      validateAttestationV1({
        v: 1,
        type: 'verified',
        subject: '',
        issuedAt: 1,
      })
    ).toMatch(/subject/);
  });

  it('rejects bad signature', () => {
    expect(
      validateAttestationV1({
        v: 1,
        type: 'verified',
        subject: 'x',
        issuedAt: 1,
        signature: { alg: '', sig: 'a' },
      })
    ).toMatch(/signature/);
  });
});

describe('extension namespacing rule', () => {
  it('apps must put extra fields under x.<appId>.<field>', () => {
    const p = profileV1({
      x: {
        dating: { orientation: 'queer' },
        marketplace: { storeUrl: 'https://x' },
      },
    });
    expect(p.x?.dating).toEqual({ orientation: 'queer' });
    expect(p.x?.marketplace).toEqual({ storeUrl: 'https://x' });
  });
});
