'use client';

import { useCallback, useState } from 'react';
import {
  UserPlusFillIcon,
  osFloatingPanelCountClassName,
  osIconActionClassName,
  type ActionDrawerItem,
} from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import { formatProfileCount } from '@/lib/profile-social-standings';

export type GuildManageSheetId =
  | 'requests'
  | 'members'
  | 'proposals'
  | 'add-member';

interface GuildManageMenuProps {
  pendingRequestCount: number;
  memberCount: number;
  activeProposalCount: number;
  accessGated: boolean;
  memberDriven: boolean;
  canAddMember: boolean;
  /** Owners/admins/mods — member requests inbox. */
  canReviewRequests?: boolean;
  onOpenSheet: (sheet: GuildManageSheetId) => void;
}

function CountBadge({
  count,
  tone = 'standing',
}: {
  count: number;
  tone?: 'standing' | 'solidarity';
}) {
  return (
    <span
      className={`${osFloatingPanelCountClassName} os-floating-panel-count--${tone}${
        count === 0 ? ' is-zero' : ''
      }`}
    >
      {formatProfileCount(count)}
    </span>
  );
}

/**
 * Banner manage control — opens the shared ActionDrawer (same hug chrome as
 * every other overflow / pick menu).
 */
export function GuildManageMenu({
  pendingRequestCount,
  memberCount,
  activeProposalCount,
  accessGated,
  memberDriven: _memberDriven,
  canAddMember,
  canReviewRequests = false,
  onOpenSheet,
}: GuildManageMenuProps) {
  void _memberDriven;
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const showRequests = accessGated && canReviewRequests;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  const items: ActionDrawerItem[] = [
    ...(showRequests
      ? [
          {
            id: 'requests',
            label: 'Member requests',
            leading: (
              <CountBadge count={pendingRequestCount} tone="solidarity" />
            ),
            onSelect: () => {
              onOpenSheet('requests');
              requestClose();
            },
          },
        ]
      : []),
    {
      id: 'members',
      label: 'Members',
      leading: <CountBadge count={memberCount} />,
      onSelect: () => {
        onOpenSheet('members');
        requestClose();
      },
    },
    {
      id: 'proposals',
      label: 'Proposals',
      leading: <CountBadge count={activeProposalCount} />,
      onSelect: () => {
        onOpenSheet('proposals');
        requestClose();
      },
    },
    ...(canAddMember
      ? [
          {
            id: 'add-member',
            label: 'Add member',
            onSelect: () => {
              onOpenSheet('add-member');
              requestClose();
            },
          },
        ]
      : []),
  ];

  return (
    <div className="guild-manage-menu">
      <button
        type="button"
        className={`${osIconActionClassName} guild-manage-menu-trigger${
          showRequests && pendingRequestCount > 0 ? ' has-badge' : ''
        }${sheetOpen ? ' is-open' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={
          showRequests && pendingRequestCount > 0
            ? `Guild menu, ${pendingRequestCount} pending requests`
            : 'Guild menu'
        }
      >
        <UserPlusFillIcon
          className="glass-sheet-close-icon guild-manage-menu-icon"
          aria-hidden
        />
        {showRequests && pendingRequestCount > 0 ? (
          <span className="guild-manage-menu-badge" aria-hidden>
            {formatProfileCount(pendingRequestCount)}
          </span>
        ) : null}
      </button>

      <ActionDrawer
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Guild"
        copy="Members & access"
        listAriaLabel="Guild"
        items={items}
        closeAriaLabel="Close guild menu"
      />
    </div>
  );
}
