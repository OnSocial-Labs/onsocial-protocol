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

/** Compact portfolio-face mimic: cover, crest overlapping it. Not a guild badge. */
export function DaoLookPreview({
  coverUrl,
  crestUrl,
  disabled = false,
  coverAccept = COVER_ACCEPT,
  crestAccept = CREST_ACCEPT,
  onCoverChange,
  onCrestChange,
  onRemoveCover,
  onRemoveCrest,
}: {
  coverUrl: string | null;
  crestUrl: string | null;
  disabled?: boolean;
  coverAccept?: string;
  crestAccept?: string;
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCrestChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveCover?: () => void;
  onRemoveCrest?: () => void;
}) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const crestInputRef = useRef<HTMLInputElement>(null);

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
      <div className="dao-look-preview-face">
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
        </div>
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept={coverAccept}
        data-dao-look-file="cover"
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onCoverChange}
      />
      <input
        ref={crestInputRef}
        type="file"
        accept={crestAccept}
        data-dao-look-file="crest"
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onCrestChange}
      />
    </section>
  );
}
