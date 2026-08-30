import { describe, expect, it } from 'vitest';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  buildFtContractAccountId,
  defaultFtIconDataUrl,
  FT_ICON_MAX_DATA_URL,
  getFtIconError,
  getFtContractAccountError,
  getFtParentAccountError,
  getFtSubaccountLabelError,
  normalizeFtSubaccountLabel,
  parseFtSupplySmallest,
} from '@/lib/app-create-token';
import { resolveFtTemplateIdentifier } from '@/lib/app-ft-template-config';
import { resolveTokenCreateStepStates } from '@/lib/token-create-steps';

const NAMED_PARENT =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'alice.near' : 'alice.testnet';
const TG_PARENT = 'alice.tg';
const IMPLICIT_PARENT =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describe('app-create-token', () => {
  it('normalizes flexible subaccount labels', () => {
    expect(normalizeFtSubaccountLabel(' Cool Token ')).toBe('cool-token');
    expect(normalizeFtSubaccountLabel('my_ft')).toBe('my_ft');
  });

  it('builds contract ids under the parent', () => {
    expect(buildFtContractAccountId(NAMED_PARENT, 'cool')).toBe(
      `cool.${NAMED_PARENT}`
    );
    expect(buildFtContractAccountId(NAMED_PARENT, 'token')).toBe(
      `token.${NAMED_PARENT}`
    );
  });

  it('accepts named parents and rejects implicit hex accounts', () => {
    expect(getFtParentAccountError(NAMED_PARENT)).toBe('');
    expect(getFtContractAccountError(NAMED_PARENT, 'cool')).toBe('');
    expect(getFtParentAccountError(IMPLICIT_PARENT)).toMatch(/named account/i);
    expect(getFtSubaccountLabelError('a')).toMatch(/at least/i);
  });

  it('accepts .tg parents on mainnet only', () => {
    if (ACTIVE_NEAR_NETWORK === 'mainnet') {
      expect(getFtParentAccountError(TG_PARENT)).toBe('');
      expect(buildFtContractAccountId(TG_PARENT, 'cool')).toBe('cool.alice.tg');
    } else {
      expect(getFtParentAccountError(TG_PARENT)).toMatch(/named account/i);
    }
  });

  it('parses human supply to 18 decimals', () => {
    expect(parseFtSupplySmallest('1')).toBe('1000000000000000000');
    expect(parseFtSupplySmallest('0')).toBeNull();
    expect(parseFtSupplySmallest('')).toBeNull();
  });

  it('builds a small default icon', () => {
    const icon = defaultFtIconDataUrl('ab');
    expect(icon.startsWith('data:image/svg+xml,')).toBe(true);
    expect(icon.length).toBeLessThan(800);
    expect(getFtIconError(icon)).toBe('');
  });

  it('rejects icons that will not fit on-chain', () => {
    expect(getFtIconError('')).toMatch(/icon/i);
    expect(getFtIconError('https://cdn.example/icon.png')).toMatch(/png/i);
    expect(
      getFtIconError(`data:image/png;base64,${'A'.repeat(FT_ICON_MAX_DATA_URL)}`)
    ).toMatch(/smaller/i);
  });

  it('does not silently resolve an unpublished SOCIAL fallback', () => {
    expect(resolveFtTemplateIdentifier()).toBeNull();
  });
});

describe('token create step thread', () => {
  it('spins only the first circle while the batch is in flight', () => {
    const confirming = resolveTokenCreateStepStates('confirming', true);
    expect(confirming.map((step) => step.state)).toEqual([
      'spinning',
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
  });

  it('fills every step on success and marks the first failed on error', () => {
    expect(
      resolveTokenCreateStepStates('success', false).every(
        (step) => step.state === 'done'
      )
    ).toBe(true);
    expect(resolveTokenCreateStepStates('error', false)[0]?.state).toBe(
      'failed'
    );
  });

  it('omits lock unless the creator chose it', () => {
    expect(resolveTokenCreateStepStates('idle', false)).toHaveLength(4);
    expect(resolveTokenCreateStepStates('idle', true).at(-1)?.id).toBe('lock');
  });
});
