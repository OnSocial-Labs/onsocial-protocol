'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { GlobeIcon, MultiplyIcon } from '@onsocial/ui';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { PAGE_LINK_NOTE_MAX } from '@/lib/page-launch-config';
import { PROFILE_ABOUT_PHOTO_ACCEPT } from '@/lib/profile-about-photos';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  PORTFOLIO_WEBSITE_LIMIT,
  type PortfolioWebsiteDraft,
} from '@/lib/profile-websites';

const PHOTO_TYPES = new Set(PROFILE_ABOUT_PHOTO_ACCEPT.split(','));

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

function WebsitePhotoControl({
  row,
  label,
  onPick,
}: {
  row: PortfolioWebsiteDraft;
  label: string;
  onPick: () => void;
}) {
  const localUrl = useObjectUrl(row.imageFile ?? null);
  const src = localUrl || resolveProfileMediaUrl(row.image) || '';
  return (
    <button
      type="button"
      className="account-editor-link-icon-slot account-editor-website-photo-btn"
      aria-label={src ? `Change ${label} photo` : `Add ${label} photo`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
    >
      {src ? (
        <img src={src} alt="" className="account-editor-website-photo" />
      ) : (
        <GlobeIcon className="portfolio-link-icon" aria-hidden />
      )}
    </button>
  );
}

export function PortfolioWebsitesEditor({
  websites,
  errors,
  focusId,
  onChange,
  onRemove,
  onAdd,
  onBlurRow,
  onFocusConsumed,
}: {
  websites: PortfolioWebsiteDraft[];
  errors: Record<string, string>;
  focusId?: string | null;
  onChange: (id: string, patch: Partial<PortfolioWebsiteDraft>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onBlurRow: (id: string) => void;
  onFocusConsumed?: () => void;
}) {
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const canAdd = websites.length < PORTFOLIO_WEBSITE_LIMIT;
  const fileRef = useRef<HTMLInputElement>(null);
  const pickIdRef = useRef<string | null>(null);
  const [photoRejectId, setPhotoRejectId] = useState<string | null>(null);

  const stayInRow = (event: FocusEvent<HTMLElement>) => {
    const field = event.currentTarget.closest('.account-editor-link-field');
    const next = event.relatedTarget;
    return next instanceof Node && Boolean(field?.contains(next));
  };

  const handleBlur = (id: string) => (event: FocusEvent<HTMLElement>) => {
    if (stayInRow(event)) return;
    onBlurRow(id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const choosePhoto = (id: string) => {
    pickIdRef.current = id;
    fileRef.current?.click();
  };

  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    const id = pickIdRef.current;
    if (!id || !file) return;
    if (!PHOTO_TYPES.has(file.type)) {
      setPhotoRejectId(id);
      return;
    }
    setPhotoRejectId(null);
    onChange(id, { imageFile: file });
  };

  return (
    <div className="account-editor-websites">
      <input
        ref={fileRef}
        type="file"
        accept={PROFILE_ABOUT_PHOTO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onPhoto}
      />
      {websites.length > 0 ? (
        <div className="account-editor-link-grid">
          {websites.map((row, index) => {
            const error = errors[row.id];
            const label =
              websites.length > 1 ? `Website ${index + 1}` : 'Website';
            return (
              <div key={row.id} className="account-editor-link-field">
                <span className="account-editor-link-input">
                  <WebsitePhotoControl
                    row={row}
                    label={label}
                    onPick={() => choosePhoto(row.id)}
                  />
                  <input
                    className="account-editor-link-value"
                    value={row.name}
                    placeholder="Name"
                    aria-label={`${label} name`}
                    maxLength={PAGE_LINK_NOTE_MAX}
                    autoComplete="off"
                    autoFocus={row.id === focusId}
                    onFocus={(event) => {
                      scrollFieldIntoView(event);
                      if (row.id === focusId) onFocusConsumed?.();
                    }}
                    onChange={(event) =>
                      onChange(row.id, {
                        name: event.target.value.slice(0, PAGE_LINK_NOTE_MAX),
                      })
                    }
                    onBlur={handleBlur(row.id)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    type="button"
                    className="account-editor-link-cancel"
                    aria-label={`Remove ${label.toLowerCase()}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onRemove(row.id)}
                  >
                    <MultiplyIcon
                      aria-hidden
                      className="account-editor-link-cancel-icon"
                    />
                  </button>
                </span>
                {row.image?.trim() || row.imageFile ? (
                  <button
                    type="button"
                    className="account-editor-website-photo-remove"
                    aria-label={`Remove ${label} photo`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setPhotoRejectId(null);
                      onChange(row.id, { image: '', imageFile: null });
                    }}
                  >
                    Remove photo
                  </button>
                ) : null}
                {photoRejectId === row.id ? (
                  <span
                    className="account-editor-website-photo-error"
                    role="alert"
                  >
                    Use a photo
                  </span>
                ) : null}
                <span
                  className={`account-editor-link-input account-editor-website-url${
                    error ? ' is-invalid' : ''
                  }`}
                >
                  <span className="account-editor-link-icon-slot" aria-hidden>
                    <PortfolioLinkIcon
                      kind="website"
                      className="portfolio-link-icon account-editor-website-url-spacer"
                    />
                  </span>
                  <input
                    className="account-editor-link-value"
                    value={row.url}
                    placeholder="example.com"
                    aria-label={`${label} address`}
                    aria-invalid={error ? true : undefined}
                    maxLength={255}
                    inputMode="url"
                    autoComplete="url"
                    onFocus={scrollFieldIntoView}
                    onChange={(event) =>
                      onChange(row.id, { url: event.target.value })
                    }
                    onBlur={handleBlur(row.id)}
                    onKeyDown={handleKeyDown}
                  />
                  {error ? (
                    <span
                      className="account-editor-link-inline-error"
                      role="alert"
                    >
                      {error}
                    </span>
                  ) : null}
                </span>
                <input
                  className="account-editor-link-title"
                  value={row.line}
                  placeholder="Optional line"
                  aria-label={`${label} line`}
                  maxLength={PAGE_LINK_NOTE_MAX}
                  autoComplete="off"
                  onFocus={scrollFieldIntoView}
                  onChange={(event) =>
                    onChange(row.id, {
                      line: event.target.value.slice(0, PAGE_LINK_NOTE_MAX),
                    })
                  }
                  onBlur={handleBlur(row.id)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {canAdd ? (
        <button
          type="button"
          className="account-editor-links-add account-editor-websites-add"
          onClick={onAdd}
        >
          Add website
        </button>
      ) : null}
    </div>
  );
}
