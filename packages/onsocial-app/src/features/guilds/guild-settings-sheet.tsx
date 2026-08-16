'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';

interface GuildSettingsSheetProps {
  open: boolean;
  guildName?: string;
  onClose: () => void;
  onEditGuild: () => void;
  onOpenRooms: () => void;
  onOpenGroupStorage: () => void;
}

/**
 * Settings hub for guild owners/admins — Edit guild + Rooms + future tools.
 * Toolbar gear opens this sheet instead of deep-linking into the editor.
 */
export function GuildSettingsSheet({
  open,
  guildName,
  onClose,
  onEditGuild,
  onOpenRooms,
  onOpenGroupStorage,
}: GuildSettingsSheetProps) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Settings"
      copy={guildName?.trim() || 'Guild tools and configuration'}
      closeAriaLabel="Close"
      backdropLabel="Close guild settings"
      zIndex={57}
      initialDetent="peek"
      headerClassName="guild-settings-sheet-header"
      panelClassName="guild-settings-sheet-panel"
    >
      <OsSurfaceRowList
        className="guild-settings-sheet-list"
        aria-label="Guild settings"
      >
        <OsSurfaceRow
          label="Edit guild"
          description="Banner, name, topics, access"
          onClick={() => {
            onEditGuild();
            requestClose();
          }}
        />
        <OsSurfaceRow
          label="Rooms"
          description="Rooms and feed tabs"
          onClick={() => {
            onOpenRooms();
            requestClose();
          }}
        />
        <OsSurfaceRow
          label="Group storage"
          description="Fund the pool and add storage for members"
          onClick={() => {
            onOpenGroupStorage();
            requestClose();
          }}
        />
        <OsSurfaceRow
          label="Analytics"
          description="Reach, posts, and member activity"
          badge="Soon"
          disabled
        />
      </OsSurfaceRowList>
    </OsHugSheet>
  );
}
