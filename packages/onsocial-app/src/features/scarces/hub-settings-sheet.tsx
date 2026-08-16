'use client';

import { useCallback, useState } from 'react';
import {
  OsHugSheet,
  OsSurfaceRow,
  OsSurfaceRowList,
  osFloatingPanelCountClassName,
} from '@onsocial/ui';
import type { HubManageSheetId } from '@/features/scarces/hub-manage-sheets';
import { formatProfileCount } from '@/lib/profile-social-standings';

interface HubSettingsSheetProps {
  open: boolean;
  hubName?: string;
  /** Owner-only: look / access / transfer. */
  showOwnerTools: boolean;
  showPeople: boolean;
  showPublishRequests: boolean;
  publishRequestCount?: number;
  onClose: () => void;
  onOpenSheet: (sheet: HubManageSheetId) => void;
}

/**
 * Settings hub for hub owners / staff — look / access / people /
 * publish requests / transfer. Toolbar gear opens this instead of an
 * inline manage dump.
 */
export function HubSettingsSheet({
  open,
  hubName,
  showOwnerTools,
  showPeople,
  showPublishRequests,
  publishRequestCount = 0,
  onClose,
  onOpenSheet,
}: HubSettingsSheetProps) {
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

  const openSheet = (sheet: HubManageSheetId) => {
    onOpenSheet(sheet);
    requestClose();
  };

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Settings"
      copy={hubName?.trim() || 'Hub tools and configuration'}
      closeAriaLabel="Close"
      backdropLabel="Close hub settings"
      zIndex={57}
      initialDetent="peek"
      headerClassName="guild-settings-sheet-header"
      panelClassName="guild-settings-sheet-panel"
    >
      <OsSurfaceRowList
        className="guild-settings-sheet-list"
        aria-label="Hub settings"
      >
        {showOwnerTools ? (
          <OsSurfaceRow
            label="Edit look"
            description="Logo, banner, name, categories"
            onClick={() => openSheet('look')}
          />
        ) : null}

        {showOwnerTools ? (
          <OsSurfaceRow
            label="Access & sales"
            description="Commission and who can create drops"
            onClick={() => openSheet('access')}
          />
        ) : null}

        {showPeople ? (
          <OsSurfaceRow
            label="People"
            description="Moderators and approved creators"
            onClick={() => openSheet('people')}
          />
        ) : null}

        {showPublishRequests ? (
          <OsSurfaceRow
            label="Publish requests"
            description="Approve creators waiting to publish"
            onClick={() => openSheet('publish-requests')}
            {...(publishRequestCount > 0
              ? {
                  trailing: (
                    <span
                      className={`${osFloatingPanelCountClassName} os-floating-panel-count--solidarity`}
                      aria-hidden
                    >
                      {formatProfileCount(publishRequestCount)}
                    </span>
                  ),
                }
              : {})}
          />
        ) : null}

        {showOwnerTools ? (
          <OsSurfaceRow
            label="Transfer hub"
            description="Hand ownership to another account"
            onClick={() => openSheet('transfer')}
          />
        ) : null}
      </OsSurfaceRowList>
    </OsHugSheet>
  );
}
