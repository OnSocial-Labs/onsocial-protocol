'use client';

import { useMemo } from 'react';
import { ChoiceDrawerField, type ChoiceOption } from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { normalizeNearAccountId } from '@/lib/app-near-account';

export function isProtocolRemoveMemberReady(
  memberId: string,
  options: readonly string[]
): boolean {
  if (!memberId.trim() || options.length === 0) return false;
  const normalized = normalizeNearAccountId(memberId);
  return options.some(
    (option) => normalizeNearAccountId(option) === normalized
  );
}

function memberChoiceLabel(
  accountId: string,
  displayName: string | null | undefined
): string {
  const trimmed = displayName?.trim();
  return trimmed && trimmed.toLowerCase() !== accountId.toLowerCase()
    ? trimmed
    : accountId;
}

export function ProtocolComposeRemoveMemberField({
  roleId,
  memberId,
  options,
  onMemberChange,
  disabled = false,
  zIndex,
}: {
  roleId: string;
  memberId: string;
  options: readonly string[];
  onMemberChange: (memberId: string) => void;
  disabled?: boolean;
  zIndex: number;
}) {
  const profiles = usePostAuthorProfiles([...options]);
  const normalizedMemberId = normalizeNearAccountId(memberId);
  const selectedProfile = profiles[normalizedMemberId];

  const choiceOptions = useMemo(
    (): ChoiceOption<string>[] =>
      options.map((accountId) => {
        const normalized = normalizeNearAccountId(accountId);
        const profile = profiles[normalized];
        const label = memberChoiceLabel(normalized, profile?.displayName);
        return {
          value: accountId,
          label,
          description:
            label.toLowerCase() !== normalized.toLowerCase()
              ? normalized
              : undefined,
          leading: (
            <AccountAvatar
              accountId={normalized}
              kind={profile?.kind}
              src={profile?.avatarUrl ?? null}
              fallbackInitial={profile?.displayName || normalized}
              size="sm"
              className="os-choice-option-avatar"
            />
          ),
        };
      }),
    [options, profiles]
  );

  const chipLeading = normalizedMemberId ? (
    <AccountAvatar
      accountId={normalizedMemberId}
      kind={selectedProfile?.kind}
      src={selectedProfile?.avatarUrl ?? null}
      fallbackInitial={selectedProfile?.displayName || normalizedMemberId}
      size="sm"
      className="os-choice-chip-avatar"
    />
  ) : undefined;

  if (options.length === 0) {
    return (
      <p className="protocol-compose-note is-warn">
        No other members in {roleId.trim() || 'this role'} yet.
      </p>
    );
  }

  return (
    <div className="guild-field">
      <ChoiceDrawerField
        label="Member"
        value={memberId}
        options={choiceOptions}
        onChange={onMemberChange}
        disabled={disabled}
        persistSelected
        chipLeading={chipLeading}
        copy={`Members in ${roleId.trim() || 'this role'}`}
        zIndex={zIndex}
      />
    </div>
  );
}
