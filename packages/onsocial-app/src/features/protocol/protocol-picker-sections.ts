export type ProtocolPickerOption<T extends string> = {
  id: T;
  label: string;
  hint: string;
  group: string;
};

export type ProtocolPickerGroup = {
  id: string;
  label: string;
};

export function buildProtocolPickerSections<T extends string>(opts: {
  allOptions: ProtocolPickerOption<T>[];
  commonIds: readonly T[];
  groups: readonly ProtocolPickerGroup[];
  filterReady: boolean;
  hasPermission: (id: T) => boolean;
}): {
  common: ProtocolPickerOption<T>[];
  grouped: Array<ProtocolPickerGroup & { options: ProtocolPickerOption<T>[] }>;
  hasVisible: boolean;
} {
  const { allOptions, commonIds, groups, filterReady, hasPermission } = opts;
  const commonIdSet = new Set(commonIds);

  const visible = (options: ProtocolPickerOption<T>[]) =>
    filterReady ? options.filter((option) => hasPermission(option.id)) : options;

  const common = visible(
    commonIds
      .map((id) => allOptions.find((option) => option.id === id))
      .filter((option): option is ProtocolPickerOption<T> => Boolean(option))
  );

  const grouped = groups
    .map((group) => ({
      ...group,
      options: visible(
        allOptions.filter(
          (option) => option.group === group.id && !commonIdSet.has(option.id)
        )
      ),
    }))
    .filter((group) => group.options.length > 0);

  return {
    common,
    grouped,
    hasVisible: common.length > 0 || grouped.some((group) => group.options.length > 0),
  };
}

export function protocolPickerStakeGateMessage(
  remainingLabel: string | null,
  scope: 'propose' | 'settings'
): string {
  const amount = remainingLabel ?? 'more';
  if (scope === 'settings') {
    return `Need ${amount} SOCIAL delegated · Stake or pick an action.`;
  }
  return `Need ${amount} SOCIAL delegated · Stake or pick a kind.`;
}

export function protocolPickerForeignStakeMessage(
  tokenLabel: string | null,
  scope: 'propose' | 'settings'
): string {
  const token = tokenLabel ?? "this DAO's token";
  return scope === 'settings'
    ? `Need ${token} stake to propose settings.`
    : `Need ${token} stake to propose.`;
}

/** Propose / Settings pickers hug like the wallet — content height, short cap. */
export const PROTOCOL_PICKER_LAYOUT = {
  initialDetent: 'full' as const,
  peekRatio: 1,
};

/** Kind rows only once a wallet can pick — no logged-out catalog dump. */
export function shouldShowProtocolPickerOptions(
  accountId: string | null,
  loadState: 'idle' | 'loading' | 'ready' | 'error'
): boolean {
  return Boolean(accountId) && loadState === 'ready';
}

export function countProtocolPickerOptions<T extends string>(
  common: ProtocolPickerOption<T>[],
  grouped: ReadonlyArray<{ options: ProtocolPickerOption<T>[] }>
): number {
  return (
    common.length +
    grouped.reduce((total, group) => total + group.options.length, 0)
  );
}
