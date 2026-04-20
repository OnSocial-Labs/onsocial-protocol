// ---------------------------------------------------------------------------
// Integration: Social Extras — saves, endorsements, attestations
//
// Write via SDK builders → verify via substreams-indexed GraphQL views.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import {
  ACCOUNT_ID,
  confirmDirect,
  confirmIndexed,
  getClient,
  testId,
} from './helpers.js';
import type { OnSocial } from '../../src/client.js';
import {
  buildSaveSetData,
  buildSaveRemoveData,
  buildEndorsementSetData,
  buildEndorsementRemoveData,
  buildAttestationSetData,
  buildAttestationRemoveData,
} from '../../src/social.js';

describe('social-extras', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();
  });

  // ── Saves (private bookmarks) ─────────────────────────────────────────

  describe('saves', () => {
    const targetPostId = testId();

    it('should save a post (basic bookmark)', async () => {
      const data = buildSaveSetData(`post/${targetPostId}`);
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in saves_current via indexer', async () => {
      const saves = await confirmIndexed(
        async () => {
          const s = await os.query.getSaves(ACCOUNT_ID);
          return s.some((r) => r.contentPath.includes(targetPostId)) ? s : null;
        },
        'save'
      );
      const save = saves.find((r) => r.contentPath.includes(targetPostId))!;
      expect(save.accountId).toBe(ACCOUNT_ID);
      const val = JSON.parse(save.value);
      expect(val.v).toBe(1);
      expect(val.timestamp).toBeGreaterThan(0);
    }, 35_000);

    it('should save with folder and note', async () => {
      const folderId = testId();
      const data = buildSaveSetData(`post/${folderId}`, {
        folder: 'favorites',
        note: 'great post',
      });
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();

      const saves = await confirmIndexed(
        async () => {
          const s = await os.query.getSaves(ACCOUNT_ID);
          return s.some((r) => r.contentPath.includes(folderId)) ? s : null;
        },
        'save with folder'
      );
      const val = JSON.parse(
        saves.find((r) => r.contentPath.includes(folderId))!.value
      );
      expect(val.folder).toBe('favorites');
      expect(val.note).toBe('great post');
    }, 35_000);

    it('should remove a save (tombstone)', async () => {
      const data = buildSaveRemoveData(`post/${targetPostId}`);
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, value);
      expect(result.txHash).toBeTruthy();
    });
  });

  // ── Endorsements (weighted directed vouch) ────────────────────────────

  describe('endorsements', () => {
    const endorseTarget = 'onsocial.testnet';

    it('should endorse another account (basic)', async () => {
      const data = buildEndorsementSetData(endorseTarget);
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in endorsements_current via indexer (given)', async () => {
      const endorsed = await confirmIndexed(
        async () => {
          const e = await os.query.getEndorsementsGiven(ACCOUNT_ID);
          const match = e.find(
            (r) =>
              r.target === endorseTarget &&
              r.value !== '{}' &&
              r.value !== 'null'
          );
          return match ? e : null;
        },
        'endorsement given'
      );
      const row = endorsed.find(
        (r) =>
          r.target === endorseTarget && r.value !== '{}' && r.value !== 'null'
      )!;
      expect(row.issuer).toBe(ACCOUNT_ID);
      const val = JSON.parse(row.value);
      expect(val.v).toBe(1);
      expect(val.since).toBeGreaterThan(0);
    }, 35_000);

    it('should appear in endorsements_current via indexer (received)', async () => {
      const received = await confirmIndexed(
        async () => {
          const e = await os.query.getEndorsementsReceived(endorseTarget);
          return e.some((r) => r.issuer === ACCOUNT_ID) ? e : null;
        },
        'endorsement received'
      );
      expect(received.some((r) => r.issuer === ACCOUNT_ID)).toBe(true);
    }, 35_000);

    it('should endorse with weight and topic', async () => {
      const topicId = `rust-${testId()}`;
      const data = buildEndorsementSetData(endorseTarget, {
        topic: topicId,
        weight: 5,
        note: 'excellent rust dev',
      });
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();

      // Verify via on-chain RPC (topic-scoped endorsements need path-based lookup)
      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne(
              `endorsement/${endorseTarget}/${topicId}`,
              ACCOUNT_ID
            );
            return e?.value ? e : null;
          } catch {
            return null;
          }
        },
        'endorsement with topic',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.topic).toBe(topicId);
      expect(val.weight).toBe(5);
      expect(val.note).toBe('excellent rust dev');
    }, 25_000);

    it('should endorse with expiry', async () => {
      const expiryTopic = `temp-${testId()}`;
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      const data = buildEndorsementSetData(endorseTarget, {
        topic: expiryTopic,
        expiresAt,
      });
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();

      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne(
              `endorsement/${endorseTarget}/${expiryTopic}`,
              ACCOUNT_ID
            );
            return e?.value ? e : null;
          } catch {
            return null;
          }
        },
        'endorsement with expiry',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.expiresAt).toBe(expiresAt);
    }, 25_000);

    it('should remove a basic endorsement (tombstone)', async () => {
      const data = buildEndorsementRemoveData(endorseTarget);
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, value);
      expect(result.txHash).toBeTruthy();
    });

    it('should remove a topic-scoped endorsement', async () => {
      const data = buildEndorsementRemoveData(endorseTarget, 'remove-test');
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, value);
      expect(result.txHash).toBeTruthy();
    });
  });

  // ── Attestations (verifiable typed claims) ────────────────────────────

  describe('attestations', () => {
    const claimId = testId();
    const subject = 'onsocial.testnet';
    const claimType = 'identity-verification';

    it('should create a minimal attestation', async () => {
      const data = buildAttestationSetData(claimId, {
        type: claimType,
        subject,
      });
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in claims_current via indexer (issued)', async () => {
      const claims = await confirmIndexed(
        async () => {
          const c = await os.query.getClaimsIssued(ACCOUNT_ID, {
            claimType,
          });
          return c.some((r) => r.claimId === claimId) ? c : null;
        },
        'claim issued'
      );
      const claim = claims.find((r) => r.claimId === claimId)!;
      expect(claim.issuer).toBe(ACCOUNT_ID);
      expect(claim.subject).toBe(subject);
      expect(claim.claimType).toBe(claimType);
      const val = JSON.parse(claim.value);
      expect(val.v).toBe(1);
      expect(val.issuedAt).toBeGreaterThan(0);
    }, 35_000);

    it('should appear in claims_current via indexer (about subject)', async () => {
      const claims = await confirmIndexed(
        async () => {
          const c = await os.query.getClaimsAbout(subject, { claimType });
          return c.some((r) => r.issuer === ACCOUNT_ID) ? c : null;
        },
        'claim about subject'
      );
      expect(claims.some((r) => r.issuer === ACCOUNT_ID)).toBe(true);
    }, 35_000);

    it('should create attestation with full metadata', async () => {
      const fullId = testId();
      const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
      const data = buildAttestationSetData(fullId, {
        type: 'skill-assessment',
        subject,
        scope: 'typescript',
        expiresAt,
        metadata: { level: 'expert', assessedBy: ACCOUNT_ID },
        signature: {
          alg: 'ed25519',
          sig: 'dGVzdHNpZ25hdHVyZQ==',
        },
      });
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();

      const claims = await confirmIndexed(
        async () => {
          const c = await os.query.getClaimsIssued(ACCOUNT_ID, {
            claimType: 'skill-assessment',
          });
          return c.some((r) => r.claimId === fullId) ? c : null;
        },
        'full claim'
      );
      const val = JSON.parse(claims.find((r) => r.claimId === fullId)!.value);
      expect(val.type).toBe('skill-assessment');
      expect(val.scope).toBe('typescript');
      expect(val.expiresAt).toBe(expiresAt);
      expect(val.metadata.level).toBe('expert');
      expect(val.signature.alg).toBe('ed25519');
      expect(val.signature.sig).toBe('dGVzdHNpZ25hdHVyZQ==');
    }, 40_000);

    it('should create attestation with extensions (x)', async () => {
      const xId = testId();
      const data = buildAttestationSetData(xId, {
        type: 'membership',
        subject,
        x: { myapp: { tier: 'gold', since: '2024-01' } },
      });
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();

      const claims = await confirmIndexed(
        async () => {
          const c = await os.query.getClaimsIssued(ACCOUNT_ID, {
            claimType: 'membership',
          });
          return c.some((r) => r.claimId === xId) ? c : null;
        },
        'claim with extensions'
      );
      const val = JSON.parse(claims.find((r) => r.claimId === xId)!.value);
      expect(val.x.myapp.tier).toBe('gold');
    }, 35_000);

    it('should create multiple claims of the same type', async () => {
      const secondId = testId();
      const data = buildAttestationSetData(secondId, {
        type: claimType,
        subject,
        metadata: { round: 2 },
      });
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();

      // Both claims should be queryable
      const claims = await confirmIndexed(
        async () => {
          const c = await os.query.getClaimsIssued(ACCOUNT_ID, { claimType });
          const hasFirst = c.some((r) => r.claimId === claimId);
          const hasSecond = c.some((r) => r.claimId === secondId);
          return hasFirst && hasSecond ? c : null;
        },
        'multiple claims'
      );
      expect(claims.length).toBeGreaterThanOrEqual(2);
    }, 35_000);

    it('should remove an attestation (tombstone)', async () => {
      const data = buildAttestationRemoveData(subject, claimType, claimId);
      const [path, value] = Object.entries(data)[0];
      const result = await os.social.set(path, value);
      expect(result.txHash).toBeTruthy();
    });
  });
});
