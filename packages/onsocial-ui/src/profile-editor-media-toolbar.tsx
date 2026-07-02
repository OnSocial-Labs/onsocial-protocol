'use client';

import type { MouseEvent } from 'react';
import { CameraIcon, TrashIcon } from './mage-stroke-icons.js';

/** Stroke weight for camera / trash glyphs on profile media overlays. */
export const PROFILE_EDITOR_MEDIA_GLYPH_STROKE = 1.75;

export type ProfileEditorMediaLayout = 'banner' | 'avatar';

export interface ProfileEditorMediaToolbarProps {
  layout: ProfileEditorMediaLayout;
  removeLabel?: string;
  onRemove?: () => void;
}

function stopRemoveClick(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Hover affordances on profile media tiles.
 * Change is handled by the full-tile backdrop button — camera is visual only.
 */
export function ProfileEditorMediaToolbar({
  layout,
  removeLabel,
  onRemove,
}: ProfileEditorMediaToolbarProps) {
  return (
    <span
      className={`profile-editor-media-toolbar profile-editor-media-toolbar--${layout}`}
      aria-hidden={!onRemove}
    >
      <span className="profile-editor-media-camera">
        <CameraIcon
          strokeWidth={PROFILE_EDITOR_MEDIA_GLYPH_STROKE}
          className={`profile-editor-media-toolbar-glyph profile-editor-media-toolbar-glyph--${layout}`}
          aria-hidden
        />
      </span>

      {onRemove && removeLabel ? (
        <button
          type="button"
          className="profile-editor-media-remove-btn"
          aria-label={removeLabel}
          onClick={(event) => {
            stopRemoveClick(event);
            onRemove();
          }}
        >
          <TrashIcon
            strokeWidth={PROFILE_EDITOR_MEDIA_GLYPH_STROKE}
            className="profile-editor-media-remove-glyph"
            aria-hidden
          />
        </button>
      ) : null}
    </span>
  );
}
