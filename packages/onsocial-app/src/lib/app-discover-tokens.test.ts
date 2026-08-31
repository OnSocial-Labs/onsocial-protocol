import { describe, expect, it } from 'vitest';
import { ACTIVE_NEAR_NETWORK, SOCIAL_TOKEN_CONTRACT } from '@/lib/app-config';
import {
  getAddTokenOwnershipError,
  isDiscoverableCreatorToken,
  isFtChildAccount,
  isProtocolListedToken,
  uniqueTokenContractIds,
} from '@/lib/app-discover-tokens';

const ALICE =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'alice.near' : 'alice.testnet';
const COOL = `cool.${ALICE}`;
const OTHER = ACTIVE_NEAR_NETWORK === 'mainnet' ? 'bob.near' : 'bob.testnet';

describe('app-discover-tokens', () => {
  it('treats only true subaccounts as children', () => {
    expect(isFtChildAccount(COOL, ALICE)).toBe(true);
    expect(isFtChildAccount(ALICE, ALICE)).toBe(false);
    expect(
      isFtChildAccount(
        ACTIVE_NEAR_NETWORK === 'mainnet' ? 'alice.near' : 'alice.testnet',
        ACTIVE_NEAR_NETWORK === 'mainnet' ? 'near' : 'testnet'
      )
    ).toBe(false);
    expect(isFtChildAccount(OTHER, ALICE)).toBe(false);
  });

  it('keeps tokens they still admin or locked children', () => {
    expect(
      isDiscoverableCreatorToken({
        contractId: COOL,
        viewerId: ALICE,
        ownerId: ALICE,
      })
    ).toBe(true);
    expect(
      isDiscoverableCreatorToken({
        contractId: COOL,
        viewerId: ALICE,
        ownerId: 'system',
      })
    ).toBe(true);
    expect(
      isDiscoverableCreatorToken({
        contractId: COOL,
        viewerId: ALICE,
        ownerId: null,
      })
    ).toBe(true);
    expect(
      isDiscoverableCreatorToken({
        contractId: OTHER,
        viewerId: ALICE,
        ownerId: ALICE,
      })
    ).toBe(true);
    expect(
      isDiscoverableCreatorToken({
        contractId: OTHER,
        viewerId: ALICE,
        ownerId: OTHER,
      })
    ).toBe(false);
  });

  it('never lists SOCIAL or wrap as a creator token', () => {
    expect(isProtocolListedToken(SOCIAL_TOKEN_CONTRACT)).toBe(true);
    expect(
      isDiscoverableCreatorToken({
        contractId: SOCIAL_TOKEN_CONTRACT,
        viewerId: ALICE,
        ownerId: ALICE,
      })
    ).toBe(false);
    expect(
      getAddTokenOwnershipError({
        contractId: SOCIAL_TOKEN_CONTRACT,
        viewerId: ALICE,
        ownerId: ALICE,
        hasMetadata: true,
      })
    ).toMatch(/SOCIAL/i);
  });

  it('rejects a holding that is not theirs', () => {
    expect(
      getAddTokenOwnershipError({
        contractId: OTHER,
        viewerId: ALICE,
        ownerId: OTHER,
        hasMetadata: true,
      })
    ).toMatch(/not yours/i);
    expect(
      getAddTokenOwnershipError({
        contractId: COOL,
        viewerId: ALICE,
        ownerId: ALICE,
        hasMetadata: false,
      })
    ).toMatch(/not a token/i);
  });

  it('dedupes and caps probe ids', () => {
    expect(
      uniqueTokenContractIds([COOL, ` ${COOL} `, SOCIAL_TOKEN_CONTRACT])
    ).toEqual([COOL]);
    const many = Array.from({ length: 20 }, (_, i) => `t${i}.${ALICE}`);
    expect(uniqueTokenContractIds(many)).toHaveLength(16);
  });
});
