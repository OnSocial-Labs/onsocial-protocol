'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  type GlassSheetPresentation,
} from '@onsocial/ui';
import {
  ProfileAccountSearchPicks,
  profileAccountSearchActive,
} from '@/components/profile/profile-account-search-picks';
import { NearAccountField } from '@/components/ui/near-account-field';
import {
  nearAccountStatusClass,
  useNearAccountStatus,
} from '@/hooks/use-near-account-status';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { accountIdsEqual } from '@/lib/account-match';
import {
  nearAccountPlaceholder,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';

export type ProfileInviteAccount = {
  accountId: string;
  name?: string | null;
  avatarUrl?: string | null;
  kind?: 'human' | 'dao' | null;
};

export interface ProfileInviteHugSheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  copy: string;
  closeAriaLabel: string;
  /** Existing seats / self — excluded from results. */
  excludeAccountIds?: readonly string[];
  viewerAccountId?: string | null;
  idleActionLabel: string;
  /** CTA when a recipient is ready — receives spoken display name. */
  selectedActionLabel: (spokenName: string) => string;
  pending: boolean;
  /** Return true to close after a successful confirm. */
  onConfirm: (account: ProfileInviteAccount) => Promise<boolean>;
  zIndex?: number;
  /** Nested invites use `appear` over the roster that opened them. */
  presentation?: GlassSheetPresentation;
  footerExtra?: ReactNode;
  fieldLabel?: string;
}

/**
 * Shared NearAccountField → pick → confirm hug used by guild Add member
 * and hub Add creator / Add moderator (same field as transfer).
 */
export function ProfileInviteHugSheet({
  open,
  onClose,
  label,
  copy,
  closeAriaLabel,
  excludeAccountIds = [],
  viewerAccountId = null,
  idleActionLabel,
  selectedActionLabel,
  pending,
  onConfirm,
  zIndex = SHEET_Z.nested,
  presentation,
  footerExtra,
  fieldLabel = 'Account',
}: ProfileInviteHugSheetProps) {
  const [closing, setClosing] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [picked, setPicked] = useState<ProfileInviteAccount | null>(null);

  const sheetOpen = open && !closing;
  const normalizedTo = normalizeNearAccountId(transferTo);
  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(normalizedTo, viewerAccountId ?? '');
  const isExcluded = excludeAccountIds.some((id) =>
    accountIdsEqual(id, normalizedTo)
  );
  const accountStatus = useNearAccountStatus(transferTo);
  const statusClass = isSelf
    ? 'is-taken'
    : nearAccountStatusClass(accountStatus);
  const searchActive = profileAccountSearchActive(
    transferTo,
    accountStatus === 'found'
  );
  const recipientProfiles = usePostAuthorProfiles(
    accountStatus === 'found' && !isSelf ? [normalizedTo] : []
  );
  const recipientProfile = recipientProfiles[normalizedTo];

  const selected = useMemo((): ProfileInviteAccount | null => {
    if (!normalizedTo || isSelf || isExcluded) return null;
    if (picked && accountIdsEqual(picked.accountId, normalizedTo)) {
      return picked;
    }
    if (accountStatus !== 'found') return null;
    return {
      accountId: normalizedTo,
      name: recipientProfile?.displayName ?? null,
      avatarUrl: recipientProfile?.avatarUrl ?? null,
      kind: recipientProfile?.kind ?? null,
    };
  }, [
    accountStatus,
    isExcluded,
    isSelf,
    normalizedTo,
    picked,
    recipientProfile?.avatarUrl,
    recipientProfile?.displayName,
    recipientProfile?.kind,
  ]);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
    } else {
      setTransferTo('');
      setPicked(null);
    }
  }

  const requestClose = () => {
    if (pending) return;
    setClosing(true);
  };

  const handleClosed = () => {
    setClosing(false);
    onClose();
  };

  const handleConfirm = async () => {
    if (!selected || pending) return;
    const ok = await onConfirm(selected);
    if (ok) requestClose();
  };

  const selectedName = selected
    ? displayName(selected.accountId, selected.name ?? undefined)
    : '';
  const canConfirm = Boolean(selected) && !pending;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label={label}
      copy={copy}
      closeAriaLabel={closeAriaLabel}
      backdropLabel={closeAriaLabel}
      zIndex={zIndex}
      {...(presentation ? { presentation } : {})}
      /* Same hug chrome as hub / scarce transfer so NearAccountField matches. */
      panelClassName="hub-manage-sheet-panel hub-manage-sheet-panel--hug hub-transfer-sheet-panel os-sheet-cap-short"
      bodyClassName="hub-manage-sheet-body"
    >
      <div className="hub-manage-form guild-add-member-sheet">
        <label className="guild-field" htmlFor="profile-invite-account">
          <span>{fieldLabel}</span>
          <NearAccountField
            id="profile-invite-account"
            value={transferTo}
            disabled={pending}
            placeholder={nearAccountPlaceholder()}
            status={isSelf ? 'found' : accountStatus}
            statusClass={statusClass}
            aria-invalid={
              isSelf ||
              isExcluded ||
              accountStatus === 'missing' ||
              accountStatus === 'invalid'
            }
            onValueChange={(next) => {
              setTransferTo(next);
              setPicked(null);
            }}
          />
        </label>

        {searchActive ? (
          <div className="hub-transfer-search">
            <ProfileAccountSearchPicks
              query={transferTo}
              enabled={!pending}
              disabled={pending}
              excludeAccountIds={[
                ...excludeAccountIds,
                ...(viewerAccountId ? [viewerAccountId] : []),
              ]}
              viewerAccountId={viewerAccountId}
              onPick={(accountId) => {
                setTransferTo(accountId);
                setPicked({ accountId });
              }}
            />
          </div>
        ) : null}

        {!searchActive && isSelf ? (
          <p className="hub-manage-hint">Choose another account.</p>
        ) : null}
        {!searchActive && isExcluded && !isSelf ? (
          <p className="hub-manage-hint">Already on this roster.</p>
        ) : null}
        {!searchActive && accountStatus === 'missing' ? (
          <p className="hub-manage-hint">
            No NEAR account found for {fallbackLabel(normalizedTo)}.
          </p>
        ) : null}

        {footerExtra}
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            ready={canConfirm}
            pending={pending}
            disabled={!canConfirm}
            onClick={() => void handleConfirm()}
          >
            {selected
              ? selectedActionLabel(selectedName)
              : idleActionLabel}
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </OsHugSheet>
  );
}
