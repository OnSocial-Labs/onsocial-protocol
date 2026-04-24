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

describe('social-extras', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();
  });

  // ── Saves (private bookmarks) ─────────────────────────────────────────

  describe('saves', () => {
    const targetPostId = testId();

    it('should save a post (basic bookmark)', async () => {
      const result = await os.social.save(`post/${targetPostId}`);
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in saves_current via indexer', async () => {
      const saves = await confirmIndexed(async () => {
        const s = await os.query.saves.list(ACCOUNT_ID);
        return s.some((r) => r.contentPath.includes(targetPostId)) ? s : null;
      }, 'save');
      if (!saves) throw new Error('save missing from index');
      const save = saves.find((r) => r.contentPath.includes(targetPostId))!;
      expect(save.accountId).toBe(ACCOUNT_ID);
      const val = JSON.parse(save.value);
      expect(val.v).toBe(1);
      expect(val.timestamp).toBeGreaterThan(0);
    }, 35_000);

    it('should expose the saved bookmark via direct read', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const value = await os.social.getOne(
              `saved/post/${targetPostId}`,
              ACCOUNT_ID
            );
            return value?.value ? value : null;
          } catch {
            return null;
          }
        },
        'save direct read',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!entry) throw new Error('save missing from direct read');
      const value =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(value).toMatchObject({ v: 1 });
      expect(typeof value.timestamp).toBe('number');
    }, 25_000);

    it('should save with folder and note', async () => {
      const folderId = testId();
      const result = await os.social.save(`post/${folderId}`, {
        folder: 'favorites',
        note: 'great post',
      });
      expect(result.txHash).toBeTruthy();

      const saves = await confirmIndexed(async () => {
        const s = await os.query.saves.list(ACCOUNT_ID);
        return s.some((r) => r.contentPath.includes(folderId)) ? s : null;
      }, 'save with folder');
      if (!saves) throw new Error('save with folder missing from index');
      const val = JSON.parse(
        saves.find((r) => r.contentPath.includes(folderId))!.value
      );
      expect(val.folder).toBe('favorites');
      expect(val.note).toBe('great post');
    }, 35_000);

    it('should remove a save (tombstone)', async () => {
      const result = await os.social.unsave(`post/${targetPostId}`);
      expect(result.txHash).toBeTruthy();
    });

    it('should remove the save from saves_current via indexer', async () => {
      const saves = await confirmIndexed(async () => {
        const value = await os.query.saves.list(ACCOUNT_ID);
        return !value.some((r) => r.contentPath.includes(targetPostId))
          ? value
          : null;
      }, 'save removed');

      if (!saves) throw new Error('save still present in index');
      expect(saves.some((r) => r.contentPath.includes(targetPostId))).toBe(
        false
      );
    }, 35_000);

    it('should expose the save tombstone via direct read', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const value = await os.social.getOne(
              `saved/post/${targetPostId}`,
              ACCOUNT_ID
            );
            return value?.deleted ? value : null;
          } catch {
            return null;
          }
        },
        'save tombstone direct read',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!entry) throw new Error('save tombstone missing from direct read');
      expect(entry.deleted).toBe(true);
    }, 25_000);
  });

  // ── Endorsements (weighted directed vouch) ────────────────────────────

  describe('endorsements', () => {
    const endorseTarget = 'onsocial.testnet';

    it('should endorse another account (basic)', async () => {
      const result = await os.social.endorse(endorseTarget);
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in endorsements_current via indexer (given)', async () => {
      const endorsed = await confirmIndexed(async () => {
        const e = await os.query.endorsements.given(ACCOUNT_ID);
        const match = e.find(
          (r) =>
            r.target === endorseTarget && r.value !== '{}' && r.value !== 'null'
        );
        return match ? e : null;
      }, 'endorsement given');
      if (!endorsed) throw new Error('endorsement missing from index');
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
      const received = await confirmIndexed(async () => {
        const e = await os.query.endorsements.received(endorseTarget);
        return e.some((r) => r.issuer === ACCOUNT_ID) ? e : null;
      }, 'endorsement received');
      if (!received) throw new Error('received endorsement missing from index');
      expect(received.some((r) => r.issuer === ACCOUNT_ID)).toBe(true);
    }, 35_000);

    it('should endorse with weight and topic', async () => {
      const topicId = `rust-${testId()}`;
      const result = await os.social.endorse(endorseTarget, {
        topic: topicId,
        weight: 5,
        note: 'excellent rust dev',
      });
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
      if (!entry) throw new Error('topic endorsement missing from direct read');
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.topic).toBe(topicId);
      expect(val.weight).toBe(5);
      expect(val.note).toBe('excellent rust dev');
    }, 25_000);

    it('should endorse with expiry', async () => {
      const expiryTopic = `temp-${testId()}`;
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      const result = await os.social.endorse(endorseTarget, {
        topic: expiryTopic,
        expiresAt,
      });
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
      if (!entry)
        throw new Error('expiry endorsement missing from direct read');
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.expiresAt).toBe(expiresAt);
    }, 25_000);

    it('should remove a basic endorsement (tombstone)', async () => {
      const result = await os.social.unendorse(endorseTarget);
      expect(result.txHash).toBeTruthy();
    });

    it('should remove the basic endorsement from current index views', async () => {
      const given = await confirmIndexed(async () => {
        const result = await os.query.graphql<{
          endorsementsCurrent: Array<{ path: string; operation: string }>;
        }>({
          query: `query EndorsementByPath($path: String!) {
              endorsementsCurrent(
                where: {path: {_eq: $path}, operation: {_eq: "set"}}
              ) {
                path
                operation
              }
            }`,
          variables: {
            path: `${ACCOUNT_ID}/endorsement/${endorseTarget}`,
          },
        });
        const rows = result.data?.endorsementsCurrent ?? [];
        return rows.length === 0 ? rows : null;
      }, 'endorsement removed');

      if (!given) throw new Error('endorsement still present in index');
      expect(given).toHaveLength(0);
    }, 35_000);

    it('should expose the removed basic endorsement as a tombstone via direct read', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const value = await os.social.getOne(
              `endorsement/${endorseTarget}`,
              ACCOUNT_ID
            );
            return value?.deleted ? value : null;
          } catch {
            return null;
          }
        },
        'endorsement tombstone direct read',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!entry) {
        throw new Error('endorsement tombstone missing from direct read');
      }
      expect(entry.deleted).toBe(true);
    }, 25_000);

    it('should remove a topic-scoped endorsement', async () => {
      const result = await os.social.unendorse(endorseTarget, 'remove-test');
      expect(result.txHash).toBeTruthy();
    }, 20_000);
  });

  // ── Attestations (verifiable typed claims) ────────────────────────────

  describe('attestations', () => {
    const claimId = testId();
    const subject = 'onsocial.testnet';
    const claimType = 'identity-verification';

    it('should create a minimal attestation', async () => {
      const result = await os.social.attest(claimId, {
        type: claimType,
        subject,
      });
      expect(result.txHash).toBeTruthy();
    }, 20_000);

    it('should expose the minimal attestation via direct read', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const value = await os.social.getOne(
              `claims/${subject}/${claimType}/${claimId}`,
              ACCOUNT_ID
            );
            return value?.value ? value : null;
          } catch {
            return null;
          }
        },
        'minimal attestation direct read',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!entry)
        throw new Error('minimal attestation missing from direct read');
      const value =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(value).toMatchObject({
        v: 1,
        type: claimType,
        subject,
      });
      expect(typeof value.issuedAt).toBe('number');
    }, 25_000);

    it('should appear in claims_current via indexer (issued)', async () => {
      const claims = await confirmIndexed(async () => {
        const c = await os.query.attestations.issued(ACCOUNT_ID, {
          claimType,
        });
        return c.some((r) => r.claimId === claimId) ? c : null;
      }, 'claim issued');
      if (!claims) throw new Error('issued claim missing from index');
      const claim = claims.find((r) => r.claimId === claimId)!;
      expect(claim.issuer).toBe(ACCOUNT_ID);
      expect(claim.subject).toBe(subject);
      expect(claim.claimType).toBe(claimType);
      const val = JSON.parse(claim.value);
      expect(val.v).toBe(1);
      expect(val.issuedAt).toBeGreaterThan(0);
    }, 35_000);

    it('should appear in claims_current via indexer (about subject)', async () => {
      const claims = await confirmIndexed(async () => {
        const c = await os.query.attestations.about(subject, { claimType });
        return c.some((r) => r.issuer === ACCOUNT_ID) ? c : null;
      }, 'claim about subject');
      if (!claims) throw new Error('claim about subject missing from index');
      expect(claims.some((r) => r.issuer === ACCOUNT_ID)).toBe(true);
    }, 35_000);

    it('should create attestation with full metadata', async () => {
      const fullId = testId();
      const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
      const result = await os.social.attest(fullId, {
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
      expect(result.txHash).toBeTruthy();

      const claims = await confirmIndexed(async () => {
        const c = await os.query.attestations.issued(ACCOUNT_ID, {
          claimType: 'skill-assessment',
        });
        return c.some((r) => r.claimId === fullId) ? c : null;
      }, 'full claim');
      if (!claims) throw new Error('full claim missing from index');
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
      const result = await os.social.attest(xId, {
        type: 'membership',
        subject,
        x: { myapp: { tier: 'gold', since: '2024-01' } },
      });
      expect(result.txHash).toBeTruthy();

      const claims = await confirmIndexed(async () => {
        const c = await os.query.attestations.issued(ACCOUNT_ID, {
          claimType: 'membership',
        });
        return c.some((r) => r.claimId === xId) ? c : null;
      }, 'claim with extensions');
      if (!claims) throw new Error('claim with extensions missing from index');
      const val = JSON.parse(claims.find((r) => r.claimId === xId)!.value);
      expect(val.x.myapp.tier).toBe('gold');
    }, 35_000);

    it('should create multiple claims of the same type', async () => {
      const secondId = testId();
      const result = await os.social.attest(secondId, {
        type: claimType,
        subject,
        metadata: { round: 2 },
      });
      expect(result.txHash).toBeTruthy();

      // Both claims should be queryable
      const claims = await confirmIndexed(async () => {
        const c = await os.query.attestations.issued(ACCOUNT_ID, { claimType });
        const hasFirst = c.some((r) => r.claimId === claimId);
        const hasSecond = c.some((r) => r.claimId === secondId);
        return hasFirst && hasSecond ? c : null;
      }, 'multiple claims');
      if (!claims) throw new Error('multiple claims missing from index');
      expect(claims.length).toBeGreaterThanOrEqual(2);
    }, 35_000);

    it('should remove an attestation (tombstone)', async () => {
      const result = await os.social.revokeAttestation(
        subject,
        claimType,
        claimId
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should remove the attestation from claims_current via indexer', async () => {
      const claims = await confirmIndexed(async () => {
        const value = await os.query.attestations.issued(ACCOUNT_ID, {
          claimType,
        });
        return !value.some((r) => r.claimId === claimId) ? value : null;
      }, 'claim removed');

      if (!claims) throw new Error('claim still present in index');
      expect(claims.some((r) => r.claimId === claimId)).toBe(false);
    }, 35_000);

    it('should expose the revoked attestation as a tombstone via direct read', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const value = await os.social.getOne(
              `claims/${subject}/${claimType}/${claimId}`,
              ACCOUNT_ID
            );
            return value?.deleted ? value : null;
          } catch {
            return null;
          }
        },
        'attestation tombstone direct read',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!entry) {
        throw new Error('attestation tombstone missing from direct read');
      }
      expect(entry.deleted).toBe(true);
    }, 25_000);
  });
});
