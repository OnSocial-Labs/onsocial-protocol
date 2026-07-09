'use client';

import type { MouseEvent } from 'react';
import { CameraIcon, TrashIcon } from './mage-stroke-icons.js';

/** Stroke weight for camera / trash glyphs on profile media overlays. */
export const PROFILE_EDITOR_MEDIA_GLYPH_STROKE = 2;

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
 * Media tile affordances.
 * Change is the full-tile backdrop — camera is visual only.
 * Camera is always a glass chip in the action corner; trash sits beside it when media exists.
 */
export function ProfileEditorMediaToolbar({
  layout,
  removeLabel,
  onRemove,
}: ProfileEditorMediaToolbarProps) {
  const showRemove = Boolean(onRemove && removeLabel);

  return (
    <span
      className={`profile-editor-media-toolbar profile-editor-media-toolbar--${layout}`}
      aria-hidden={!showRemove}
    >
      <span className="profile-editor-media-camera" aria-hidden>
        <CameraIcon
          strokeWidth={PROFILE_EDITOR_MEDIA_GLYPH_STROKE}
          className={`profile-editor-media-toolbar-glyph profile-editor-media-toolbar-glyph--${layout}`}
        />
      </span>

      {showRemove ? (
        <button
          type="button"
          className="profile-editor-media-remove-btn"
          aria-label={removeLabel}
          onClick={(event) => {
            stopRemoveClick(event);
            onRemove?.();
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
