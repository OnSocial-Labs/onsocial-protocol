import { describe, expect, it } from 'vitest';
import {
  resolveNewRoleNameFieldHint,
  resolvePolicyFormValidation,
  resolvePolicySubmitFeedback,
} from '@/features/governance/governance-policy-validation';

const baseValidationInput = {
  isConnected: true,
  canEditPolicy: true,
  canProposeSelectedPolicyAction: true,
  canCoverBond: true,
  bondDisplay: '1',
  policyAction: 'add_role' as const,
  submitAttempted: false,
  editableRoleOptionsLength: 1,
  permissionsRole: null,
  selectedPermissionsCount: 1,
  permissionsUpdateChanged: true,
  memberThresholdChanged: false,
  permissionsMemberThresholdInput: '',
  permissionsMemberThresholdSmallest: null,
  bondChanged: false,
  nextBondYocto: null,
  periodChanged: false,
  periodDaysInput: '',
  parametersChanged: false,
  newRoleName: '',
  normalizedNewRoleName: null,
  roleExists: false,
  daoPolicy: null,
  addRoleAccessMode: 'custom' as const,
  addRoleUsesCustomPermissions: false,
  addRolePermissionsCount: 0,
  removableRoleOptionsLength: 1,
  targetRoleId: '',
  nextVoteThreshold: 50,
  votePolicyChanged: true,
};

describe('resolveNewRoleNameFieldHint', () => {
  it('shows format hint while typing invalid characters', () => {
    expect(
      resolveNewRoleNameFieldHint({
        newRoleName: 'Bad Name',
        normalizedNewRoleName: null,
        roleExists: false,
        submitAttempted: false,
      })
    ).toBe('Use lowercase letters, numbers, underscores.');
  });

  it('shows required hint only after submit attempt', () => {
    expect(
      resolveNewRoleNameFieldHint({
        newRoleName: '',
        normalizedNewRoleName: null,
        roleExists: false,
        submitAttempted: true,
      })
    ).toBe('Role name required.');
  });
});

describe('resolvePolicySubmitFeedback', () => {
  it('suppresses duplicate submit copy when inline field hint is active', () => {
    expect(
      resolvePolicySubmitFeedback({
        error: '',
        blockedReason: 'Enter a valid new role name.',
        fieldHints: { newRoleName: 'Role name required.' },
        submitAttempted: true,
      })
    ).toBeNull();
  });

  it('shows non-field blockers after submit attempt', () => {
    expect(
      resolvePolicySubmitFeedback({
        error: '',
        blockedReason: 'No changes yet.',
        fieldHints: {},
        submitAttempted: true,
      })
    ).toBe('No changes yet.');
  });
});

describe('resolvePolicyFormValidation', () => {
  it('returns inline role name hint without proactive submit copy', () => {
    const result = resolvePolicyFormValidation({
      ...baseValidationInput,
      newRoleName: '!!!',
      normalizedNewRoleName: null,
      submitAttempted: false,
    });

    expect(result.fieldHints.newRoleName).toBe(
      'Use lowercase letters, numbers, underscores.'
    );
    expect(result.blockedReason).toBe(
      'Use lowercase letters, numbers, underscores.'
    );
  });
});
