'use client';

import { useCallback, useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  SheetHeader,
  UserPlusFillIcon,
  osFloatingPanelCountClassName,
  osIconActionClassName,
} from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';
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

interface ManageAction {
  id: GuildManageSheetId;
  label: string;
  count?: number;
}

/**
 * Banner manage control — icon opens the shared content-hugging action drawer
 * (same open/spacing as Standing / choice drawers), not an anchored dropdown.
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
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const showRequests = accessGated && canReviewRequests;

  useScrollLock(sheetOpen);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  const actions: ManageAction[] = [
    ...(showRequests
      ? [
          {
            id: 'requests' as const,
            label: 'Member requests',
            count: pendingRequestCount,
          },
        ]
      : []),
    { id: 'members', label: 'Members', count: memberCount },
    { id: 'proposals', label: 'Proposals', count: activeProposalCount },
    ...(canAddMember
      ? [{ id: 'add-member' as const, label: 'Add member' }]
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

      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        tone="os"
        initialDetent="full"
        peekRatio={1}
        zIndex={60}
        ariaLabelledBy={titleId}
        backdropLabel="Close guild menu"
        panelClassName="scarce-choice-sheet-panel"
        bodyClassName="scarce-choice-sheet-body"
        header={
          <>
            <SheetHeader
              titleId={titleId}
              title="Guild"
              subtitle="Members & access"
              onClose={requestClose}
              closeAriaLabel="Close guild menu"
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
      >
        <div
          className="scarce-choice-sheet-list"
          role="menu"
          aria-label="Guild"
        >
          <div className="scarce-choice-sheet-section">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                className="scarce-choice-sheet-option"
                onClick={() => {
                  onOpenSheet(action.id);
                  requestClose();
                }}
              >
                {action.count != null ? (
                  <span className="scarce-choice-sheet-leading">
                    <CountBadge count={action.count} />
                  </span>
                ) : null}
                <span className="scarce-choice-sheet-option-copy">
                  <span className="scarce-choice-sheet-option-label">
                    {action.label}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}
