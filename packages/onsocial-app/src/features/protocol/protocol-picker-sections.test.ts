import { describe, expect, it } from 'vitest';
import {
  buildProtocolPickerSections,
  PROTOCOL_PICKER_LAYOUT,
  protocolPickerForeignStakeMessage,
  protocolPickerStakeGateMessage,
  shouldShowProtocolPickerOptions,
} from '@/features/protocol/protocol-picker-sections';
import {
  buildProtocolPickerActionItems,
  protocolPickerItemLockReason,
} from '@/features/protocol/protocol-picker-sheet';

type DemoId = 'a' | 'b' | 'c';

const options = [
  { id: 'a' as const, label: 'Alpha', hint: 'One', group: 'g1' },
  { id: 'b' as const, label: 'Beta', hint: 'Two', group: 'g1' },
  { id: 'c' as const, label: 'Gamma', hint: 'Three', group: 'g2' },
];

describe('buildProtocolPickerSections', () => {
  it('pins common kinds and groups the rest', () => {
    const next = buildProtocolPickerSections({
      allOptions: options,
      commonIds: ['a'],
      groups: [
        { id: 'g1', label: 'Group 1' },
        { id: 'g2', label: 'Group 2' },
      ],
      filterReady: false,
      hasPermission: () => true,
    });
    expect(next.common.map((option) => option.id)).toEqual(['a']);
    expect(next.grouped[0]?.options.map((option) => option.id)).toEqual(['b']);
    expect(next.grouped[1]?.options.map((option) => option.id)).toEqual(['c']);
    expect(next.hasVisible).toBe(true);
  });

  it('filters by permission when ready', () => {
    const next = buildProtocolPickerSections<DemoId>({
      allOptions: options,
      commonIds: ['a'],
      groups: [{ id: 'g1', label: 'Group 1' }],
      filterReady: true,
      hasPermission: (id) => id !== 'b',
    });
    expect(next.common.map((option) => option.id)).toEqual(['a']);
    expect(next.grouped).toEqual([]);
    expect(next.hasVisible).toBe(true);
  });
});

describe('protocol picker copy', () => {
  it('formats stake gate messages', () => {
    expect(protocolPickerStakeGateMessage('500', 'propose')).toMatch(
      /500 SOCIAL delegated · Stake or pick a kind/i
    );
    expect(protocolPickerStakeGateMessage(null, 'settings')).toMatch(
      /more SOCIAL delegated · Stake or pick an action/i
    );
    expect(protocolPickerForeignStakeMessage('WNEAR', 'propose')).toMatch(
      /WNEAR stake to propose/i
    );
  });
});

describe('PROTOCOL_PICKER_LAYOUT', () => {
  it('hugs content instead of expanding to a 90dvh catalog', () => {
    expect(PROTOCOL_PICKER_LAYOUT).toEqual({
      initialDetent: 'full',
      peekRatio: 1,
    });
  });
});

describe('shouldShowProtocolPickerOptions', () => {
  it('hides the catalog until a connected wallet is ready', () => {
    expect(shouldShowProtocolPickerOptions(null, 'ready')).toBe(false);
    expect(shouldShowProtocolPickerOptions('alice.near', 'loading')).toBe(
      false
    );
    expect(shouldShowProtocolPickerOptions('alice.near', 'error')).toBe(false);
    expect(shouldShowProtocolPickerOptions('alice.near', 'ready')).toBe(true);
  });
});

describe('buildProtocolPickerActionItems', () => {
  it('returns no rows until a wallet is ready', () => {
    const sections = [
      {
        key: 'common',
        label: 'Common',
        options: [{ id: 'a' as const, label: 'Alpha', hint: 'One' }],
      },
    ];
    expect(
      buildProtocolPickerActionItems({
        sections,
        accountId: null,
        loadState: 'ready',
        highlightedId: null,
        onSelect: () => undefined,
      })
    ).toEqual([]);
  });

  it('maps ready kinds onto ActionDrawer rows', () => {
    const rows = buildProtocolPickerActionItems({
      sections: [
        {
          key: 'common',
          label: 'Common',
          options: [{ id: 'a' as const, label: 'Alpha', hint: 'One' }],
        },
      ],
      accountId: 'alice.near',
      loadState: 'ready',
      highlightedId: 'a',
      onSelect: () => undefined,
    });
    expect(rows).toMatchObject([
      {
        id: 'a',
        label: 'Alpha',
        description: 'One',
        section: 'Common',
        disabled: false,
        trailing: 'Last used',
      },
    ]);
    expect(
      protocolPickerItemLockReason({
        accountId: 'alice.near',
        loadState: 'ready',
        readyReason: null,
      })
    ).toBeNull();
  });
});
