'use client';

import { OsAccountField, ProfileAvatar } from '@onsocial/ui';
import type { NearAccountStatus } from '@/hooks/use-near-account-status';
import {
  normalizeNearAccountId,
  sanitizeNearAccountInput,
} from '@/lib/app-near-account';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';

/**
 * NEAR account type-in — {@link OsAccountField} plus sanitize + on-chain probe
 * avatar. Status is lip tint only — fill stays transparent for mood/glass.
 */
export function NearAccountField({
  id,
  value,
  onValueChange,
  disabled = false,
  placeholder,
  status = 'idle',
  statusClass,
  readOnly = false,
  'aria-invalid': ariaInvalid,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  /** On-chain lookup state — drives the leading avatar slot. */
  status?: NearAccountStatus;
  /** `is-available` / `is-taken` — tints the field top lip. */
  statusClass?: string;
  readOnly?: boolean;
  'aria-invalid'?: boolean;
}) {
  const normalized = normalizeNearAccountId(value);
  const found = status === 'found';
  const checking = status === 'checking';
  const profiles = usePostAuthorProfiles(found ? [normalized] : []);
  const profile = found ? profiles[normalized] : undefined;

  return (
    <OsAccountField
      id={id}
      value={value}
      onValueChange={(next) => {
        if (readOnly) return;
        onValueChange(sanitizeNearAccountInput(next));
      }}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      statusClass={statusClass}
      aria-invalid={ariaInvalid}
      leading={
        <ProfileAvatar
          src={found ? (profile?.avatarUrl ?? null) : null}
          fallbackInitial={
            found ? profile?.displayName || normalized : undefined
          }
          shellLoading={checking}
          size="sm"
          className="os-account-field-avatar near-account-field-avatar"
        />
      }
    />
  );
}
