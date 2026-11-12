'use client';

import { OsMediaDismiss } from './os-media-dismiss.js';

export type ProfileEditorMediaLayout = 'banner' | 'avatar';

export interface ProfileEditorMediaToolbarProps {
  layout: ProfileEditorMediaLayout;
  /**
   * Page heroes draw under the nav, so the dismiss sits on the lower corner
   * instead of under the close control. Frames that start below the nav
   * keep the top corner.
   */
  corner?: 'top' | 'bottom';
  removeLabel?: string;
  onRemove?: () => void;
}

/**
 * Dismiss chip for an editor photo. Absent until there is something to remove.
 * The full tile behind it adds or replaces — no camera glyph, no press blur.
 */
export function ProfileEditorMediaToolbar({
  layout,
  corner = 'top',
  removeLabel,
  onRemove,
}: ProfileEditorMediaToolbarProps) {
  if (!onRemove || !removeLabel) return null;

  return (
    <span
      className={`profile-editor-media-toolbar profile-editor-media-toolbar--${layout}${
        corner === 'bottom' ? ' profile-editor-media-toolbar--bottom' : ''
      }`}
    >
      <OsMediaDismiss label={removeLabel} onClick={onRemove} />
    </span>
  );
}
