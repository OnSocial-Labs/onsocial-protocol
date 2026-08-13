'use client';

import {
  Divider,
  ProfileAvatar,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import type { NearAccountStatus } from '@/hooks/use-near-account-status';
import {
  normalizeNearAccountId,
  sanitizeNearAccountInput,
} from '@/lib/app-near-account';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';

/**
 * Account field — create-form bordered shell with a permanent leading avatar
 * slot and UI detail divider (same rail as the launcher dock). Empty avatar
 * until typed; shell shimmer while probing; profile avatar when found.
 * Status is lip tint only — fill stays transparent for mood/glass.
 */
export function NearAccountField({
  id,
  value,
  onValueChange,
  disabled = false,
  placeholder,
  status = 'idle',
  statusClass,
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
  'aria-invalid'?: boolean;
}) {
  const normalized = normalizeNearAccountId(value);
  const found = status === 'found';
  const checking = status === 'checking';
  const profiles = usePostAuthorProfiles(found ? [normalized] : []);
  const profile = found ? profiles[normalized] : undefined;

  return (
    <div
      className={`near-account-field ${osFieldBorderedClassName}${statusClass ? ` ${statusClass}` : ''}`}
    >
      <span className="near-account-field-leading" aria-hidden>
        <ProfileAvatar
          src={found ? (profile?.avatarUrl ?? null) : null}
          fallbackInitial={
            found ? profile?.displayName || normalized : undefined
          }
          shellLoading={checking}
          size="sm"
          className="near-account-field-avatar"
        />
      </span>
      <Divider
        orientation="vertical"
        variant="detail"
        className="near-account-field-divider"
      />
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        onChange={(event) =>
          onValueChange(sanitizeNearAccountInput(event.target.value))
        }
      />
    </div>
  );
}
