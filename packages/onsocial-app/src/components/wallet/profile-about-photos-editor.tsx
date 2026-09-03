'use client';

import { useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import {
  PROFILE_ABOUT_PHOTOS_MAX,
  PROFILE_ABOUT_PHOTO_ACCEPT,
  isProfileAboutPhotoFile,
  moveProfileAboutPhoto,
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
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const dragRef = useRef<{ from: number; over: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const atMax = photos.length >= PROFILE_ABOUT_PHOTOS_MAX;
  const canReorder = !disabled && photos.length > 1;

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

  const indexFromPoint = (x: number, y: number): number | null => {
    for (let index = 0; index < photos.length; index += 1) {
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
    const drag = dragRef.current;
    dragRef.current = null;
    setDragFrom(null);
    setDragOver(null);
    if (!drag || drag.from === drag.over) return;
    onChange(moveProfileAboutPhoto(photos, drag.from, drag.over));
  };

  const handleDragPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (!canReorder || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { from: index, over: index };
    setDragFrom(index);
    setDragOver(index);
  };

  const handleDragPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const over = indexFromPoint(event.clientX, event.clientY);
    if (over === null || over === dragRef.current.over) return;
    dragRef.current = { ...dragRef.current, over };
    setDragOver(over);
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
              key={`${photo.ref}-${index}`}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={
                dragFrom === index
                  ? 'is-dragging'
                  : dragOver === index
                    ? 'is-drop-target'
                    : undefined
              }
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
