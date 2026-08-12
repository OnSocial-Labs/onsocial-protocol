import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_ALL_PUBLIC_PERMISSIONS,
  PROTOCOL_ACTIONS_ONLY_PERMISSIONS,
  PROTOCOL_PROPOSE_ALL_PERMISSIONS,
  buildProtocolQuorumPresetOptions,
  formatVoteQuorumOptionLabel,
  matchProtocolPermissionPreset,
  resolveCouncilVotePoolSize,
  resolveVoteQuorumRisk,
  resolveVoteThresholdPresetId,
  votePolicyRulesChanged,
  votePolicyThresholdsEqual,
} from '@/features/protocol/protocol-policy-presets';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

describe('protocol policy presets', () => {
  it('matches equivalent vote thresholds across fraction forms', () => {
    expect(resolveVoteThresholdPresetId([1, 2])).toBe('pct_50');
    expect(resolveVoteThresholdPresetId([50, 100])).toBe('pct_50');
    expect(votePolicyThresholdsEqual([1, 2], [50, 100])).toBe(true);
    expect(
      votePolicyRulesChanged({
        currentThreshold: [1, 2],
        nextThreshold: [50, 100],
        currentQuorum: '0',
        nextQuorum: '0',
      })
    ).toBe(false);
    expect(
      votePolicyRulesChanged({
        currentThreshold: [1, 2],
        nextThreshold: [75, 100],
        currentQuorum: '0',
        nextQuorum: '0',
      })
    ).toBe(true);
  });

  it('builds quorum options from council size and threshold floor', () => {
    expect(
      buildProtocolQuorumPresetOptions(1, [50, 100]).map(
        (option) => option.quorum
      )
    ).toEqual(['0', '1']);
    expect(
      buildProtocolQuorumPresetOptions(2, [50, 100]).map(
        (option) => option.quorum
      )
    ).toEqual(['0', '2']);
    expect(
      buildProtocolQuorumPresetOptions(5, [50, 100]).map(
        (option) => option.quorum
      )
    ).toEqual(['0', '3', '4', '5']);
    expect(
      formatVoteQuorumOptionLabel(
        buildProtocolQuorumPresetOptions(5, [50, 100])[3]!
      )
    ).toBe('All council · 5');
  });

  it('flags quorum risk near full council', () => {
    expect(resolveVoteQuorumRisk('0', 5)).toEqual({
      level: 'none',
      message: null,
    });
    expect(resolveVoteQuorumRisk('5', 5).level).toBe('high');
    expect(resolveVoteQuorumRisk('5', 5).message).toContain(
      'before a council member leaves'
    );
    expect(resolveVoteQuorumRisk('4', 5).level).toBe('caution');
    expect(resolveVoteQuorumRisk('1', 1).level).toBe('caution');
    expect(resolveVoteQuorumRisk('3', 2).level).toBe('high');
  });

  it('matches permission presets', () => {
    expect(PROTOCOL_PROPOSE_ALL_PERMISSIONS).toHaveLength(7);
    expect(matchProtocolPermissionPreset(['*:AddProposal'])).toBe(
      'propose_all'
    );
    expect(
      matchProtocolPermissionPreset([...PROTOCOL_ALL_PUBLIC_PERMISSIONS])
    ).toBe('all_public');
    expect(
      matchProtocolPermissionPreset([...PROTOCOL_ACTIONS_ONLY_PERMISSIONS])
    ).toBe('actions_only');
    expect(
      matchProtocolPermissionPreset([
        ...PROTOCOL_ALL_PUBLIC_PERMISSIONS,
        'transfer:AddProposal',
      ])
    ).toBe('custom');
  });

  it('resolves council vote pool from guardians or council', () => {
    const policy: ProtocolDaoPolicy = {
      roles: [
        {
          name: 'guardians',
          kind: { Group: ['a.near', 'b.near', 'c.near'] },
          permissions: ['*:*'],
        },
      ],
    };
    expect(resolveCouncilVotePoolSize(policy)).toBe(3);
    expect(
      resolveCouncilVotePoolSize({
        roles: [
          {
            name: 'council',
            kind: { Group: ['x.near'] },
            permissions: ['*:*'],
          },
        ],
      })
    ).toBe(1);
    expect(resolveCouncilVotePoolSize({ roles: [] })).toBeNull();
  });
});
