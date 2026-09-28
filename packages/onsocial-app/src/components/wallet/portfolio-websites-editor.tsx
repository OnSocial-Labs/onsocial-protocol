'use client';

import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import {
  PortfolioLinkIcon,
  PortfolioWebsiteGlyph,
  PortfolioWebsiteMarkIcon,
} from '@/components/portfolio/portfolio-link-icon';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { PAGE_LINK_NOTE_MAX } from '@/lib/page-launch-config';
import { normalizeLink } from '@/lib/profile-display';
import {
  PORTFOLIO_WEBSITE_LIMIT,
  PORTFOLIO_WEBSITE_MARKS,
  type PortfolioWebsiteDraft,
  type PortfolioWebsiteMark,
} from '@/lib/profile-websites';

const WEBSITE_MARK_LABEL: Record<PortfolioWebsiteMark, string> = {
  globe: 'Globe',
  link: 'Link',
  home: 'Home',
  shop: 'Shop',
  camera: 'Camera',
  note: 'Note',
  video: 'Video',
  bookmark: 'Bookmark',
};

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
  const [openMarkId, setOpenMarkId] = useState<string | null>(null);

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

  return (
    <div className="account-editor-websites">
      {websites.length > 0 ? (
        <div className="account-editor-link-grid">
          {websites.map((row, index) => {
            const error = errors[row.id];
            const label =
              websites.length > 1 ? `Website ${index + 1}` : 'Website';
            const href = normalizeLink(row.url) ?? '';
            const pickerOpen = openMarkId === row.id;
            return (
              <div key={row.id} className="account-editor-link-field">
                <span className="account-editor-link-input">
                  <button
                    type="button"
                    className="account-editor-link-icon-slot account-editor-website-mark-btn"
                    aria-label={`${label} icon`}
                    aria-expanded={pickerOpen}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setOpenMarkId((current) =>
                        current === row.id ? null : row.id
                      )
                    }
                  >
                    <PortfolioWebsiteGlyph
                      href={href}
                      mark={row.mark}
                      className="portfolio-link-icon"
                    />
                  </button>
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
                {pickerOpen ? (
                  <div
                    className="account-editor-website-marks"
                    role="group"
                    aria-label={`${label} icons`}
                  >
                    <button
                      type="button"
                      className="account-editor-website-mark"
                      aria-label="Address"
                      aria-pressed={!row.mark}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onChange(row.id, { mark: '' })}
                    >
                      <PortfolioWebsiteGlyph
                        href={href}
                        className="portfolio-link-icon"
                      />
                    </button>
                    {PORTFOLIO_WEBSITE_MARKS.map((mark) => (
                      <button
                        key={mark}
                        type="button"
                        className="account-editor-website-mark"
                        aria-label={WEBSITE_MARK_LABEL[mark]}
                        aria-pressed={row.mark === mark}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onChange(row.id, { mark })}
                      >
                        <PortfolioWebsiteMarkIcon
                          mark={mark}
                          className="portfolio-link-icon"
                        />
                      </button>
                    ))}
                  </div>
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
