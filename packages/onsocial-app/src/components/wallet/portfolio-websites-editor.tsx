'use client';

import type { FocusEvent, KeyboardEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { PAGE_LINK_NOTE_MAX } from '@/lib/page-launch-config';
import { normalizeLink } from '@/lib/profile-display';
import { portfolioLinkKindFromHref } from '@/lib/profile-social-links';
import {
  PORTFOLIO_WEBSITE_LIMIT,
  type PortfolioWebsiteDraft,
} from '@/lib/profile-websites';

function websiteMarkKind(url: string) {
  const href = normalizeLink(url);
  if (!href) return 'website' as const;
  return portfolioLinkKindFromHref(href);
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
            return (
              <div key={row.id} className="account-editor-link-field">
                <span className="account-editor-link-input">
                  <span className="account-editor-link-icon-slot" aria-hidden>
                    <PortfolioLinkIcon
                      kind={websiteMarkKind(row.url)}
                      className="portfolio-link-icon"
                    />
                  </span>
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
