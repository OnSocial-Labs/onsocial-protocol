import { describe, expect, it } from 'vitest';
import { proposalPickerScope } from '@/features/guilds/composer-proposal-picker';

describe('proposalPickerScope', () => {
  it('stays on the current guild when composing in a guild', () => {
    expect(proposalPickerScope('builders.near')).toBe('guild');
    expect(proposalPickerScope('  builders.near  ')).toBe('guild');
  });

  it('loads memberships only on Public', () => {
    expect(proposalPickerScope(null)).toBe('memberships');
    expect(proposalPickerScope('')).toBe('memberships');
    expect(proposalPickerScope('   ')).toBe('memberships');
  });
});
