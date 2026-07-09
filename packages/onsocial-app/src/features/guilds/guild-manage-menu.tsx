'use client';

import {
  FloatingPanelMenu,
  UserPlusFillIcon,
  osFloatingPanelBodyClassName,
  osFloatingPanelCountClassName,
  osFloatingPanelHeaderActiveClassName,
  osFloatingPanelHeaderClassName,
  osFloatingPanelHeaderLabelClassName,
  osFloatingPanelItemClassName,
  osIconActionClassName,
  useDropdown,
} from '@onsocial/ui';
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
  onOpenSheet: (sheet: GuildManageSheetId) => void;
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      className={`${osFloatingPanelCountClassName} os-floating-panel-count--standing${
        count === 0 ? ' is-zero' : ''
      }`}
    >
      {formatProfileCount(count)}
    </span>
  );
}

export function GuildManageMenu({
  pendingRequestCount,
  memberCount,
  activeProposalCount,
  accessGated,
  memberDriven,
  canAddMember,
  onOpenSheet,
}: GuildManageMenuProps) {
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();
  const menuLabel = 'Manage guild';
  const showRequests = accessGated;
  const showProposals = memberDriven;

  return (
    <div className="guild-manage-menu" ref={containerRef}>
      <button
        type="button"
        className={`${osIconActionClassName} guild-manage-menu-trigger${
          pendingRequestCount > 0 ? ' has-badge' : ''
        }${isOpen ? ' is-open' : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={
          pendingRequestCount > 0
            ? `Manage guild, ${pendingRequestCount} pending requests`
            : 'Manage guild'
        }
      >
        <UserPlusFillIcon
          className="glass-sheet-close-icon guild-manage-menu-icon"
          aria-hidden
        />
        {pendingRequestCount > 0 ? (
          <span className="guild-manage-menu-badge" aria-hidden>
            {formatProfileCount(pendingRequestCount)}
          </span>
        ) : null}
      </button>

      <FloatingPanelMenu
        ref={panelRef}
        open={isOpen}
        align="right"
        offset="sm"
        className="guild-manage-menu-panel"
        role="menu"
        aria-label={menuLabel}
      >
        <div className={osFloatingPanelHeaderClassName}>
          <p className={osFloatingPanelHeaderLabelClassName}>{menuLabel}</p>
          <p className={osFloatingPanelHeaderActiveClassName}>Members & access</p>
        </div>

        <div className={osFloatingPanelBodyClassName}>
          {showRequests ? (
            <button
              type="button"
              role="menuitem"
              className={osFloatingPanelItemClassName}
              onClick={() => {
                onOpenSheet('requests');
                close();
              }}
            >
              <span>Member requests</span>
              <CountBadge count={pendingRequestCount} />
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className={osFloatingPanelItemClassName}
            onClick={() => {
              onOpenSheet('members');
              close();
            }}
          >
            <span>Members</span>
            <CountBadge count={memberCount} />
          </button>

          {showProposals ? (
            <button
              type="button"
              role="menuitem"
              className={osFloatingPanelItemClassName}
              onClick={() => {
                onOpenSheet('proposals');
                close();
              }}
            >
              <span>Proposals</span>
              <CountBadge count={activeProposalCount} />
            </button>
          ) : null}

          {canAddMember ? (
            <button
              type="button"
              role="menuitem"
              className={osFloatingPanelItemClassName}
              onClick={() => {
                onOpenSheet('add-member');
                close();
              }}
            >
              <span>Add member</span>
            </button>
          ) : null}
        </div>
      </FloatingPanelMenu>
    </div>
  );
}
