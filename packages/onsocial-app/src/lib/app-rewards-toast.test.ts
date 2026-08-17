import { describe, expect, it } from 'vitest';
import { nearExplorerTxHref } from '@/lib/app-config';
import { formatSocialCompact } from '@/lib/format-social-balance';
import {
  APP_REWARD_TOAST_HOLD_MS,
  buildAppRewardCollectToast,
  buildAppRewardCreditToast,
} from '@/lib/app-rewards-toast';
import { txToastSuccess } from '@/lib/transaction-toast-copy';

const CREDIT_YOCTO = '100000000000000000'; // 0.1 SOCIAL
const CLAIM_YOCTO = 1_000_000_000_000_000_000n; // 1 SOCIAL

describe('app rewards toast e2e contract', () => {
  it('keeps the reward toast hold past the success dismiss window', () => {
    // TransactionFeedbackToast success dismiss is 3500ms.
    expect(APP_REWARD_TOAST_HOLD_MS).toBeGreaterThanOrEqual(3500);
  });

  it('shows a green success credit toast: +amount SOCIAL · reason', () => {
    const toast = buildAppRewardCreditToast([
      {
        amountYocto: CREDIT_YOCTO,
        action: 'stand_given',
        targetAccountId: 'maya.near',
        targetDisplayName: 'Maya',
        txHash: 'credit-tx-1',
      },
    ]);

    expect(toast).toEqual({
      type: 'success',
      msg: txToastSuccess.rewardCredited(
        formatSocialCompact(CREDIT_YOCTO),
        'Stand · Maya'
      ),
      explorerHref: nearExplorerTxHref('credit-tx-1'),
    });
    expect(toast?.msg).toMatch(/^\+/);
    expect(toast?.msg).toContain('SOCIAL');
    expect(toast?.msg).toContain('Stand · Maya');
  });

  it('aggregates stand + daily into one credit toast line', () => {
    const toast = buildAppRewardCreditToast([
      {
        amountYocto: CREDIT_YOCTO,
        action: 'stand_given',
        targetAccountId: 'maya.near',
        targetDisplayName: 'Maya',
      },
      {
        amountYocto: CREDIT_YOCTO,
        action: 'daily_active',
        txHash: 'daily-tx',
      },
    ]);

    expect(toast?.type).toBe('success');
    expect(toast?.msg).toBe(
      txToastSuccess.rewardCredited(
        formatSocialCompact((BigInt(CREDIT_YOCTO) * 2n).toString()),
        'Stand · Maya · Daily check-in'
      )
    );
    expect(toast?.explorerHref).toBe(nearExplorerTxHref('daily-tx'));
  });

  it('prefers mutual stand over stand in the credit toast reason', () => {
    const toast = buildAppRewardCreditToast([
      {
        amountYocto: CREDIT_YOCTO,
        action: 'stand_given',
        targetAccountId: 'maya.near',
        targetDisplayName: 'Maya',
      },
      {
        amountYocto: CREDIT_YOCTO,
        action: 'mutual_stand_created',
        targetAccountId: 'maya.near',
        targetDisplayName: 'Maya',
      },
    ]);

    expect(toast?.msg).toContain('Mutual stand · Maya');
    expect(toast?.msg).not.toContain('Stand · Maya');
  });

  it('does not toast an empty credit burst', () => {
    expect(buildAppRewardCreditToast([])).toBeNull();
    expect(
      buildAppRewardCreditToast([
        { amountYocto: '0', action: 'daily_active' },
      ])
    ).toBeNull();
  });

  it('shows collect success as amount SOCIAL collected (not a blue pending toast)', () => {
    const toast = buildAppRewardCollectToast(CLAIM_YOCTO, 'claim-tx-9');

    expect(toast).toEqual({
      type: 'success',
      msg: txToastSuccess.rewardsCollected(formatSocialCompact(CLAIM_YOCTO)),
      explorerHref: nearExplorerTxHref('claim-tx-9'),
    });
    expect(toast?.msg).toMatch(/SOCIAL collected\.$/);
    expect(toast?.msg.startsWith('+')).toBe(false);
  });

  it('collect without a tx hash still returns success-only copy', () => {
    const toast = buildAppRewardCollectToast(CLAIM_YOCTO, null);
    expect(toast?.type).toBe('success');
    expect(toast?.explorerHref).toBeNull();
    expect(toast?.msg).toBe(
      txToastSuccess.rewardsCollected(formatSocialCompact(CLAIM_YOCTO))
    );
  });

  it('skips collect toast when claimed amount is zero', () => {
    expect(buildAppRewardCollectToast(0n, 'tx')).toBeNull();
  });
});
