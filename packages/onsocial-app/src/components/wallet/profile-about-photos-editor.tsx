'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import {
  PROFILE_ABOUT_PHOTOS_MAX,
  PROFILE_ABOUT_PHOTO_ACCEPT,
  isProfileAboutPhotoFile,
  moveProfileAboutPhoto,
  profileAboutPhotoKey,
  type ProfileAboutPhoto,
} from '@/lib/profile-about-photos';

export type ProfileAboutPhotoDraft = ProfileAboutPhoto & {
  file?: File | null;
  key?: string;
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
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const photosRef = useRef(photos);
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const atMax = photos.length >= PROFILE_ABOUT_PHOTOS_MAX;
  const canReorder = !disabled && photos.length > 1;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const handleAdd = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || disabled || atMax || !isProfileAboutPhotoFile(file)) return;
    const url = URL.createObjectURL(file);
    onChange([
      ...photos,
      {
        key: `local:${crypto.randomUUID()}`,
        ref: `local:${file.name}`,
        url,
        file,
      },
    ]);
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

  const indexFromPoint = (x: number, y: number): number | null => {
    for (let index = 0; index < photosRef.current.length; index += 1) {
      const el = itemRefs.current[index];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return index;
      }
    }
    return null;
  };

  const finishDrag = () => {
    dragRef.current = null;
    setDragFrom(null);
  };

  const handleDragPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (!canReorder || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { from: index };
    setDragFrom(index);
  };

  const handleDragPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const over = indexFromPoint(event.clientX, event.clientY);
    if (over === null || over === drag.from) return;
    onChange(moveProfileAboutPhoto(photosRef.current, drag.from, over));
    drag.from = over;
    setDragFrom(over);
  };

  return (
    <div className="account-editor-about-photos">
      <p className="account-editor-about-photos-label">Photos</p>
      <p className="account-editor-about-hint">
        {canReorder
          ? 'Up to three on About. Drag to reorder.'
          : 'Up to three on About. Wide, pair, or trio.'}
      </p>
      {photos.length > 0 ? (
        <ul
          className="account-editor-about-photos-list"
          data-count={String(photos.length)}
        >
          {photos.map((photo, index) => (
            <li
              key={profileAboutPhotoKey(photo, index)}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={dragFrom === index ? 'is-dragging' : undefined}
            >
              <img alt="" src={photo.url} draggable={false} />
              {canReorder ? (
                <button
                  type="button"
                  className="account-editor-about-photos-drag"
                  aria-label={`Reorder photo ${index + 1}`}
                  onPointerDown={(event) => handleDragPointerDown(event, index)}
                  onPointerMove={handleDragPointerMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                >
                  <span aria-hidden>⋮⋮</span>
                </button>
              ) : null}
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
