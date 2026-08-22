import { describe, expect, it } from 'vitest';
import {
  primaryProtocolCouncilGuardianRoleId,
  primaryProtocolCouncilGuardianRoleIdFromLabels,
} from '@/features/protocol/protocol-council-guardian';

describe('dao role id / label bridging', () => {
  it('resolves primary role from API ids without label round-trip', () => {
    expect(
      primaryProtocolCouncilGuardianRoleId(['council', 'guardians'])
    ).toBe('guardians');
  });

  it('still accepts Joined-style labels', () => {
    expect(
      primaryProtocolCouncilGuardianRoleIdFromLabels(['Council', 'Guardian'])
    ).toBe('guardians');
  });
});
