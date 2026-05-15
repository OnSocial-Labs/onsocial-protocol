// ---------------------------------------------------------------------------
// Integration: StorageAccountModule — full on-chain flow
//
// Covers:
//   - Reads against core.onsocial.testnet (balance/pools/allowance/sponsorship)
//   - Storage admin writes clearly requiring a wallet `execute_admin` broadcast
//   - SignerRequiredError shape check for deposit-funded writes
//   - Regular session-relayed social writes still confirmed by direct/indexed reads
//
// Not covered here:
//   - sponsor / unsponsor / setSponsor* — each account has a single outgoing
//     sponsor slot that would clobber existing testnet state; covered by the
//     contract's unit tests in storage_tip_test / sponsor tests.
//   - Successful storage admin writes — require a live wallet FullAccess signer.
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { ACCOUNT_ID, confirmDirect, getRelayedClient } from './helpers.js';
import { NEAR } from '../../src/near-amount.js';
import { SignerRequiredError } from '../../src/errors.js';
import { NeedsWalletConfirmationError } from '../../src/advanced/session.js';

// Sender for write tests — test03 is provisioned with idle balance headroom.
// (test01/02 are storage-saturated; their available_balance() is 0.)
const WRITE_SENDER = 'test03.onsocial.testnet';
const DUST_YOCTO = 1000n;
const DUST_AMOUNT = NEAR.fromYocto(DUST_YOCTO);

describe('storageAccount', () => {
  let os: OnSocial;
  let senderOs: OnSocial;

  beforeAll(async () => {
    os = await getRelayedClient();
    senderOs = await getRelayedClient(WRITE_SENDER);
  });

  describe('reads', () => {
    it('returns the account storage record via balance(accountId)', async () => {
      const balance = await os.storageAccount.balance(ACCOUNT_ID);

      expect(balance).toBeTruthy();
      expect(typeof balance?.balance).toBe('string');
      expect(typeof balance?.used_bytes).toBe('number');
      expect(typeof balance?.platform_sponsored).toBe('boolean');
      expect(Number(balance?.balance)).toBeGreaterThanOrEqual(0);
    });

    it('returns platform pool totals', async () => {
      const pool = await os.storageAccount.platformPool();

      expect(pool).toBeTruthy();
      expect(typeof pool?.storage_balance).toBe('string');
      expect(typeof pool?.total_bytes).toBe('number');
      expect(pool?.total_bytes).toBe(
        (pool?.used_bytes ?? 0) + (pool?.available_bytes ?? 0)
      );
    });

    it('returns platform allowance details', async () => {
      const allowance = await os.storageAccount.platformAllowance(ACCOUNT_ID);

      expect(typeof allowance.current_allowance).toBe('number');
      expect(typeof allowance.is_platform_sponsored).toBe('boolean');
      expect(allowance.config.onboarding_bytes).toBeGreaterThan(0);
      expect(allowance.config.daily_refill_bytes).toBeGreaterThan(0);
      expect(allowance.config.max_allowance_bytes).toBeGreaterThan(0);
    });

    it('returns sponsorshipReceived consistent with balance.shared_storage', async () => {
      const [balance, sponsorship] = await Promise.all([
        os.storageAccount.balance(ACCOUNT_ID),
        os.storageAccount.sponsorshipReceived(ACCOUNT_ID),
      ]);

      expect(sponsorship).toEqual(balance?.shared_storage ?? null);
    });

    it('returns null for non-existent group pool without throwing', async () => {
      const pool = await os.storageAccount.groupPool(
        `nonexistent-${Date.now()}`
      );
      expect(pool).toBeNull();
    });

    it('returns null for an unregistered account without throwing', async () => {
      const balance = await os.storageAccount.balance(
        `nope-${Date.now()}.testnet`
      );
      expect(balance).toBeNull();
    });
  });

  describe('deposit-funded writes (no signer)', () => {
    it('deposit() throws SignerRequiredError with a wallet-ready payload', async () => {
      try {
        await os.storageAccount.deposit(NEAR('0.1'));
        throw new Error('expected SignerRequiredError');
      } catch (err) {
        expect(err).toBeInstanceOf(SignerRequiredError);
        const e = err as SignerRequiredError;
        expect(e.code).toBe('SIGNER_REQUIRED');
        expect(e.payload.receiverId).toBe('core.onsocial.testnet');
        expect(e.payload.methodName).toBe('execute_admin');
        expect(e.payload.deposit).toBe('100000000000000000000000');
        expect(e.payload.gas).toBe('300000000000000');
        expect(e.payload.args).toEqual({
          request: {
            action: {
              type: 'set',
              data: {
                'storage/deposit': { amount: '100000000000000000000000' },
              },
            },
          },
        });
      }
    });

    it('fundGroupPool() throws SignerRequiredError carrying group_id arg', async () => {
      try {
        await os.storageAccount.fundGroupPool('any-group', NEAR('0.5'));
        throw new Error('expected SignerRequiredError');
      } catch (err) {
        expect(err).toBeInstanceOf(SignerRequiredError);
        const action = (err as SignerRequiredError).payload.args.request as {
          action: { data: Record<string, Record<string, string>> };
        };
        expect(action.action.data['storage/group_pool_deposit']).toEqual({
          group_id: 'any-group',
          amount: '500000000000000000000000',
        });
      }
    });
  });

  describe('storage admin writes', () => {
    it('tip requires an explicit wallet broadcast instead of a session relay', async () => {
      const before = await os.storageAccount.balance(WRITE_SENDER);
      if (!before)
        throw new Error(`${WRITE_SENDER} must have a storage record`);

      await expect(
        senderOs.storageAccount.tip(ACCOUNT_ID, DUST_AMOUNT)
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);

      const after = await os.storageAccount.balance(WRITE_SENDER);
      expect(after?.balance).toBe(before.balance);
    });

    it('withdraw requires an explicit wallet broadcast instead of a session relay', async () => {
      await expect(
        senderOs.storageAccount.withdraw(DUST_AMOUNT)
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
    });

    it('sponsor requires an explicit wallet broadcast instead of a session relay', async () => {
      await expect(
        senderOs.storageAccount.sponsor(ACCOUNT_ID, { maxBytes: 1024 })
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
    });
  });

  describe('atomic batch writes via os.social.set({...})', () => {
    it('writes multiple paths in one Action::Set and reads them all back via direct + graphql', async () => {
      const stamp = Date.now();
      const paths = {
        [`profile/integration_test_a_${stamp}`]: 'a',
        [`profile/integration_test_b_${stamp}`]: 'b',
        [`profile/integration_test_c_${stamp}`]: JSON.stringify({ ok: true }),
      };

      // Use the test03 client — it has idle balance to cover a few new entries.
      await senderOs.social.set(paths);

      // Path 1: direct contract read via os.social.getOne (always available).
      for (const [key, expected] of Object.entries(paths)) {
        const entry = await confirmDirect(async () => {
          const e = await os.social.getOne(key, WRITE_SENDER);
          return e?.value === expected ? e : null;
        }, `social batch ${key}`);
        expect(entry!.value).toBe(expected);
      }

      // Path 2: indexed read via os.query.graphql — same data, different
      // surface. Devs with an API key can use either path interchangeably.
      // Lenient: testnet substreams may lag; we still exercise the query
      // path and surface a warning if rows haven't landed yet.
      const targetPath = `profile/integration_test_a_${stamp}`;
      let row: { path: string; value: string } | null = null;
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const result = await os.query.graphql<{
          dataUpdates: Array<{ path: string; value: string }>;
        }>({
          query: `query SocialBatchEntry($author: String!, $path: String!) {
              dataUpdates(
                where: {
                  author: {_eq: $author},
                  path: {_eq: $path}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                path
                value
              }
            }`,
          variables: { author: WRITE_SENDER, path: targetPath },
        });
        row = result.data?.dataUpdates?.[0] ?? null;
        if (row) break;
        await new Promise((r) => setTimeout(r, 3000));
      }

      if (row) {
        expect(row.path).toBe(targetPath);
        // Indexer may store the value as raw or JSON-quoted; tolerate either.
        expect(row.value).toMatch(/^"?a"?$/);
      } else {
        console.warn(
          `[storageAccount] social batch dataUpdates lookup missed within 20s — ` +
            `substreams lag, not a SDK regression`
        );
      }
    }, 60_000);
  });
});
