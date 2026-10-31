'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';
import { GuildCountBadge } from '@/features/guilds/guild-manage-menu';
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
  onClose: () => void;
  /** Replace this sheet with the next one. Skips the close slide. */
  onHandoff?: (id: GuildSettingsActionId) => void;
  onEditGuild: () => void;
  onOpenRooms: () => void;
  onOpenGroupStorage: () => void;
  onOpenProposals?: () => void;
}

/**
 * Settings hub. Proposals lead for members; rooms and storage stay
 * with owners and admins. The toolbar gear opens this sheet.
 */
export function GuildSettingsSheet({
  open,
  guildName,
  viewer,
  activeProposalCount = 0,
  onClose,
  onHandoff,
  onEditGuild,
  onOpenRooms,
  onOpenGroupStorage,
  onOpenProposals,
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
              ) : undefined
            }
            onClick={() => select(action.id)}
          />
        ))}
      </OsSurfaceRowList>
    </OsHugSheet>
  );
}
