import { describe, expect, it } from 'vitest';
import {
  DAO_STAKE_ROLE_CONNECT_CTA,
  DAO_STAKE_ROLE_META,
  DAO_STAKE_ROLE_MET_STATUS,
  DAO_STAKE_ROLE_PROGRESS_LABEL,
  daoStakeRoleCtaLabel,
  daoStakeRoleGateCopy,
  daoStakeRoleProgressValue,
} from '@/features/protocol/dao-members-copy';

describe('dao stake role copy', () => {
  it('keeps gate, progress, and CTA distinct', () => {
    expect(DAO_STAKE_ROLE_META).toBe('Stake');
    expect(daoStakeRoleGateCopy('500', 'SOCIAL')).toBe(
      '500 SOCIAL required to propose.'
    );
    expect(DAO_STAKE_ROLE_PROGRESS_LABEL).toBe('Your stake');
    expect(daoStakeRoleProgressValue('0', '500', 'SOCIAL')).toBe(
      '0 / 500 SOCIAL'
    );
    expect(daoStakeRoleCtaLabel('500', 'SOCIAL')).toBe('Stake 500 SOCIAL');
    expect(DAO_STAKE_ROLE_MET_STATUS).toBe("You're in");
    expect(DAO_STAKE_ROLE_CONNECT_CTA).toBe('Connect to stake');
  });
});
