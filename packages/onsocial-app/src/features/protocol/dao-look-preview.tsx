'use client';

import { useRef, type ChangeEvent } from 'react';
import { ProfileEditorMediaToolbar } from '@onsocial/ui';
import {
  DAO_CREATE_ADD_COVER,
  DAO_CREATE_ADD_CREST,
  DAO_CREATE_CHANGE_COVER,
  DAO_CREATE_CHANGE_CREST,
  DAO_CREATE_REMOVE_COVER,
  DAO_CREATE_REMOVE_CREST,
} from '@/features/protocol/dao-create-voice';

const COVER_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const CREST_ACCEPT = 'image/png,image/jpeg,image/webp';

export function DaoLookPreview({
  coverUrl,
  disabled = false,
  accept = COVER_ACCEPT,
  onCoverChange,
  onRemoveCover,
}: {
  coverUrl: string | null;
  disabled?: boolean;
  accept?: string;
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveCover?: () => void;
}) {
  const coverInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="dao-look-preview" aria-label="DAO look">
      <div
        className={`dao-look-preview-cover profile-editor-media-host${
          coverUrl ? ' has-media' : ''
        }`}
      >
        <button
          type="button"
          className="profile-editor-media-backdrop dao-look-preview-cover-hit"
          aria-label={
            coverUrl ? DAO_CREATE_CHANGE_COVER : DAO_CREATE_ADD_COVER
          }
          disabled={disabled}
          onClick={() => coverInputRef.current?.click()}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="dao-look-preview-cover-image"
            />
          ) : (
            <span className="dao-look-preview-cover-empty">
              {DAO_CREATE_ADD_COVER}
            </span>
          )}
        </button>
        <ProfileEditorMediaToolbar
          layout="banner"
          removeLabel={coverUrl ? DAO_CREATE_REMOVE_COVER : undefined}
          onRemove={coverUrl ? onRemoveCover : undefined}
        />
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept={accept}
        data-dao-look-file="cover"
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onCoverChange}
      />
    </section>
  );
}

/** Square mark that sits beside the name — same place as the DAO face. */
export function DaoCrestWell({
  crestUrl,
  disabled = false,
  accept = CREST_ACCEPT,
  onCrestChange,
  onRemoveCrest,
}: {
  crestUrl: string | null;
  disabled?: boolean;
  accept?: string;
  onCrestChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveCrest?: () => void;
}) {
  const crestInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`dao-look-preview-crest profile-editor-media-host${
        crestUrl ? ' has-media' : ''
      }`}
    >
      <button
        type="button"
        className="profile-editor-media-backdrop dao-look-preview-crest-hit"
        aria-label={
          crestUrl ? DAO_CREATE_CHANGE_CREST : DAO_CREATE_ADD_CREST
        }
        disabled={disabled}
        onClick={() => crestInputRef.current?.click()}
      >
        {crestUrl ? (
          <img
            src={crestUrl}
            alt=""
            className="dao-look-preview-crest-image"
          />
        ) : (
          <span className="dao-look-preview-crest-empty" aria-hidden>
            +
          </span>
        )}
      </button>
      <ProfileEditorMediaToolbar
        layout="avatar"
        removeLabel={crestUrl ? DAO_CREATE_REMOVE_CREST : undefined}
        onRemove={crestUrl ? onRemoveCrest : undefined}
      />
      <input
        ref={crestInputRef}
        type="file"
        accept={accept}
        data-dao-look-file="crest"
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onCrestChange}
      />
    </div>
  );
}
