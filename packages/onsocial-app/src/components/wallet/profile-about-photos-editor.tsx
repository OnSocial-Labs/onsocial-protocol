'use client';

import { useRef, type ChangeEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import {
  PROFILE_ABOUT_PHOTOS_MAX,
  PROFILE_ABOUT_PHOTO_ACCEPT,
  isProfileAboutPhotoFile,
  type ProfileAboutPhoto,
} from '@/lib/profile-about-photos';

export type ProfileAboutPhotoDraft = ProfileAboutPhoto & {
  file?: File | null;
};

interface ProfileAboutPhotosEditorProps {
  photos: ProfileAboutPhotoDraft[];
  onChange: (photos: ProfileAboutPhotoDraft[]) => void;
  disabled?: boolean;
}

export function ProfileAboutPhotosEditor({
  photos,
  onChange,
  disabled = false,
}: ProfileAboutPhotosEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = photos.length >= PROFILE_ABOUT_PHOTOS_MAX;

  const handleAdd = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || disabled || atMax || !isProfileAboutPhotoFile(file)) return;
    const url = URL.createObjectURL(file);
    onChange([...photos, { ref: `local:${file.name}`, url, file }]);
  };

  const handleRemove = (index: number) => {
    if (disabled) return;
    const next = photos.filter((_, itemIndex) => itemIndex !== index);
    const removed = photos[index];
    if (removed?.file && removed.url.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }
    onChange(next);
  };

  return (
    <div className="account-editor-about-photos">
      <p className="account-editor-about-photos-label">Photos</p>
      <p className="account-editor-about-hint">
        Up to three on About. Wide, pair, or trio.
      </p>
      {photos.length > 0 ? (
        <ul
          className="account-editor-about-photos-list"
          data-count={String(photos.length)}
        >
          {photos.map((photo, index) => (
            <li key={`${photo.ref}-${index}`}>
              <img alt="" src={photo.url} />
              <button
                type="button"
                className="account-editor-about-photos-remove"
                disabled={disabled}
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => handleRemove(index)}
              >
                <MultiplyIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {atMax ? null : (
        <button
          type="button"
          className="account-editor-about-photos-add"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Add photo
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_ABOUT_PHOTO_ACCEPT}
        className="account-editor-file-input"
        onChange={handleAdd}
      />
    </div>
  );
}
