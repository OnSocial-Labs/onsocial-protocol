'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';
import { GuildCountBadge } from '@/features/guilds/guild-count-badge';
import {
  guildSettingsActions,
  type GuildSettingsActionId,
  type GuildSettingsViewer,
} from '@/features/guilds/guild-settings-actions';
import { SHEET_Z } from '@/lib/sheet-z';

interface GuildSettingsSheetProps {
  open: boolean;
  guildName?: string;
  viewer: GuildSettingsViewer | null;
  /** Active governance count, shown on the proposals row. */
  activeProposalCount?: number;
  /** People waiting to join. Shown on the requests row. */
  pendingRequestCount?: number;
  onClose: () => void;
  /** Replace this sheet with the next one. Skips the close slide. */
  onHandoff?: (id: GuildSettingsActionId) => void;
  onEditGuild: () => void;
  onOpenRooms: () => void;
  onOpenGroupStorage: () => void;
  onOpenProposals?: () => void;
  onOpenRequests?: () => void;
}

/**
 * Settings hub. Requests lead for reviewers, then proposals.
 * Rooms and storage stay with owners and admins. The hero gear opens this.
 */
export function GuildSettingsSheet({
  open,
  guildName,
  viewer,
  activeProposalCount = 0,
  pendingRequestCount = 0,
  onClose,
  onHandoff,
  onEditGuild,
  onOpenRooms,
  onOpenGroupStorage,
  onOpenProposals,
  onOpenRequests,
}: GuildSettingsSheetProps) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const actions = guildSettingsActions(viewer);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const select = useCallback(
    (id: GuildSettingsActionId) => {
      if (onHandoff) {
        onHandoff(id);
        return;
      }
      if (id === 'requests') onOpenRequests?.();
      if (id === 'proposals') onOpenProposals?.();
      if (id === 'edit') onEditGuild();
      if (id === 'rooms') onOpenRooms();
      if (id === 'storage') onOpenGroupStorage();
      requestClose();
    },
    [
      onEditGuild,
      onHandoff,
      onOpenGroupStorage,
      onOpenProposals,
      onOpenRequests,
      onOpenRooms,
      requestClose,
    ]
  );

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Settings"
      copy={guildName?.trim() || 'Guild tools and configuration'}
      closeAriaLabel="Close"
      backdropLabel="Close guild settings"
      zIndex={SHEET_Z.facts}
      headerClassName="guild-settings-sheet-header"
      panelClassName="guild-settings-sheet-panel"
    >
      <OsSurfaceRowList
        className="guild-settings-sheet-list"
        aria-label="Guild settings"
      >
        {actions.map((action) => (
          <OsSurfaceRow
            key={action.id}
            label={action.label}
            description={action.description}
            leading={
              action.id === 'proposals' ? (
                <GuildCountBadge count={activeProposalCount} />
              ) : action.id === 'requests' ? (
                <GuildCountBadge
                  count={pendingRequestCount}
                  tone="solidarity"
                />
              ) : undefined
            }
            onClick={() => select(action.id)}
          />
        ))}
      </OsSurfaceRowList>
    </OsHugSheet>
  );
}
