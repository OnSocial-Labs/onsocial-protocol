'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PageSection } from '@onsocial/sdk';
import type { PublicPageConfig } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import type { ProfilePostPeek, ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import {
  resolvePortfolioSocialLinks,
  type PortfolioSocialLink,
} from '@/lib/profile-social-links';
import {
  PAGE_LINK_NOTE_MAX,
  PAGE_SECTION_PIN_MAX,
  pageSectionCustomizeLabel,
  resolveEditablePageSections,
  resolveHiddenCustomizableSections,
  sanitizeLinkNotes,
  sanitizeSectionPins,
  sectionPinsFor,
  storeShelfPinCandidates,
  toggleSectionPin,
} from '@/lib/page-launch-config';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';
import {
  PAGE_DRAWER_HOLDINGS_PEEK,
  toPortfolioHoldingPeek,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { fetchOwnedScarcesPage } from '@/features/market/market-listings';

interface CustomizeLaunchChaptersProps {
  pageAccountId: string;
  config: PublicPageConfig;
  profileLinks?: unknown;
  guilds?: ProfileGuildSummary[];
  postPeeks?: ProfilePostPeek[];
  createdPeeks?: ProfileCreatedPeek[];
  storeShelf?: ProfileStoreShelf;
  disabled?: boolean;
  onSave: (patch: {
    sections: PageSection[];
    sectionPins: PublicPageConfig['sectionPins'];
    linkNotes: PublicPageConfig['linkNotes'];
  }) => Promise<string | null>;
}

function moveSection(
  sections: PageSection[],
  index: number,
  delta: -1 | 1
): PageSection[] {
  const next = [...sections];
  const target = index + delta;
  if (target < 0 || target >= next.length) return sections;
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

function PinRow({
  label,
  pinned,
  disabled,
  onToggle,
}: {
  label: string;
  pinned: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`customize-pin-row${pinned ? ' is-pinned' : ''}`}
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={pinned}
    >
      <span className="customize-pin-mark" aria-hidden>
        {pinned ? '★' : '☆'}
      </span>
      <span className="customize-pin-label">{label}</span>
    </button>
  );
}

export function CustomizeLaunchChapters({
  pageAccountId,
  config,
  profileLinks = null,
  guilds = [],
  postPeeks = [],
  createdPeeks = [],
  storeShelf = EMPTY_PROFILE_STORE,
  disabled = false,
  onSave,
}: CustomizeLaunchChaptersProps) {
  const [sections, setSections] = useState(() =>
    resolveEditablePageSections(config)
  );
  const [pins, setPins] = useState(() => sanitizeSectionPins(config.sectionPins));
  const [notes, setNotes] = useState(() => sanitizeLinkNotes(config.linkNotes));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [holdings, setHoldings] = useState<PortfolioHoldingPeek[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      setSections(resolveEditablePageSections(config));
      setPins(sanitizeSectionPins(config.sectionPins));
      setNotes(sanitizeLinkNotes(config.linkNotes));
      setDirty(false);
    });
  }, [config]);

  useEffect(() => {
    const owner = pageAccountId.trim();
    if (!owner) {
      setHoldings([]);
      return;
    }
    let cancelled = false;
    void fetchOwnedScarcesPage(owner, {
      pageSize: Math.max(PAGE_DRAWER_HOLDINGS_PEEK, 8),
    })
      .then((page) => {
        if (cancelled) return;
        setHoldings(page.items.map(toPortfolioHoldingPeek));
      })
      .catch(() => {
        if (!cancelled) setHoldings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pageAccountId]);

  const links = useMemo(
    () => resolvePortfolioSocialLinks(profileLinks),
    [profileLinks]
  );
  const storeCandidates = useMemo(
    () => storeShelfPinCandidates(storeShelf),
    [storeShelf]
  );
  const hidden = resolveHiddenCustomizableSections(sections);

  const markDirty = useCallback(() => setDirty(true), []);

  const setPinList = useCallback(
    (section: PageSection, next: string[]) => {
      setPins((prev) => {
        const copy = { ...prev };
        if (next.length === 0) {
          delete copy[section];
        } else {
          copy[section] = next;
        }
        return copy;
      });
      markDirty();
    },
    [markDirty]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const hash = await onSave({
        sections,
        sectionPins: pins,
        linkNotes: notes,
      });
      if (hash != null) {
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  }, [notes, onSave, pins, sections]);

  const postPins = sectionPinsFor({ sectionPins: pins }, 'posts');
  const guildPins = sectionPinsFor({ sectionPins: pins }, 'groups');
  const createdPins = sectionPinsFor({ sectionPins: pins }, 'created');
  const storePins = sectionPinsFor({ sectionPins: pins }, 'store');
  const collectiblePins = sectionPinsFor({ sectionPins: pins }, 'collectibles');

  return (
    <div className="customize-launch">
      <p className="customize-sheet-label">Launch chapters</p>
      <p className="customize-sheet-copy">
        Reorder what visitors see when they open your page. Hide empty noise.
        Pin up to {PAGE_SECTION_PIN_MAX} featured items per chapter.
      </p>

      <ul className="customize-chapter-list">
        {sections.map((section, index) => (
          <li key={section} className="customize-chapter-row">
            <span className="customize-chapter-name">
              {pageSectionCustomizeLabel(section)}
            </span>
            <span className="customize-chapter-actions">
              <button
                type="button"
                className="customize-chapter-move"
                disabled={disabled || saving || index === 0}
                aria-label={`Move ${pageSectionCustomizeLabel(section)} up`}
                onClick={() => {
                  setSections((prev) => moveSection(prev, index, -1));
                  markDirty();
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="customize-chapter-move"
                disabled={disabled || saving || index === sections.length - 1}
                aria-label={`Move ${pageSectionCustomizeLabel(section)} down`}
                onClick={() => {
                  setSections((prev) => moveSection(prev, index, 1));
                  markDirty();
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="customize-chapter-hide"
                disabled={disabled || saving || sections.length <= 1}
                onClick={() => {
                  setSections((prev) => prev.filter((s) => s !== section));
                  markDirty();
                }}
              >
                Hide
              </button>
            </span>
          </li>
        ))}
      </ul>

      {hidden.length > 0 ? (
        <div className="customize-chapter-hidden">
          <p className="customize-sheet-copy">Hidden</p>
          <div className="customize-chapter-hidden-actions">
            {hidden.map((section) => (
              <button
                key={section}
                type="button"
                className="page-drawer-section-action"
                disabled={disabled || saving}
                onClick={() => {
                  setSections((prev) =>
                    prev.includes(section) ? prev : [...prev, section]
                  );
                  markDirty();
                }}
              >
                Show {pageSectionCustomizeLabel(section)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {postPeeks.length > 0 && sections.includes('posts') ? (
        <div className="customize-pin-block">
          <p className="customize-sheet-copy">Featured posts</p>
          <div className="customize-pin-list">
            {postPeeks.slice(0, 8).map((post) => {
              const id = post.postId;
              const pinned = postPins.includes(id);
              return (
                <PinRow
                  key={`${post.accountId}:${id}`}
                  label={post.text.trim().slice(0, 48) || `Post ${id}`}
                  pinned={pinned}
                  disabled={disabled || saving}
                  onToggle={() =>
                    setPinList('posts', toggleSectionPin(postPins, id))
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {guilds.length > 0 && sections.includes('groups') ? (
        <div className="customize-pin-block">
          <p className="customize-sheet-copy">Featured guilds</p>
          <div className="customize-pin-list">
            {guilds.slice(0, 8).map((guild) => {
              const id = guild.groupId;
              const pinned = guildPins.includes(id);
              return (
                <PinRow
                  key={id}
                  label={guildDisplayName(guild.name, guild.groupId)}
                  pinned={pinned}
                  disabled={disabled || saving}
                  onToggle={() =>
                    setPinList('groups', toggleSectionPin(guildPins, id))
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {storeCandidates.length > 0 && sections.includes('store') ? (
        <div className="customize-pin-block">
          <p className="customize-sheet-copy">Featured in Store</p>
          <div className="customize-pin-list">
            {storeCandidates.slice(0, 8).map((item) => {
              const pinned = storePins.includes(item.id);
              return (
                <PinRow
                  key={item.id}
                  label={item.label}
                  pinned={pinned}
                  disabled={disabled || saving}
                  onToggle={() =>
                    setPinList('store', toggleSectionPin(storePins, item.id))
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {createdPeeks.length > 0 && sections.includes('created') ? (
        <div className="customize-pin-block">
          <p className="customize-sheet-copy">Featured created</p>
          <div className="customize-pin-list">
            {createdPeeks.slice(0, 8).map((item) => {
              const id = item.tokenId;
              const pinned = createdPins.includes(id);
              return (
                <PinRow
                  key={id}
                  label={item.title}
                  pinned={pinned}
                  disabled={disabled || saving}
                  onToggle={() =>
                    setPinList('created', toggleSectionPin(createdPins, id))
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {holdings.length > 0 && sections.includes('collectibles') ? (
        <div className="customize-pin-block">
          <p className="customize-sheet-copy">Featured collectibles</p>
          <div className="customize-pin-list">
            {holdings.slice(0, 8).map((item) => {
              const id = item.tokenId;
              const pinned = collectiblePins.includes(id);
              return (
                <PinRow
                  key={id}
                  label={item.title}
                  pinned={pinned}
                  disabled={disabled || saving}
                  onToggle={() =>
                    setPinList(
                      'collectibles',
                      toggleSectionPin(collectiblePins, id)
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {links.length > 0 && sections.includes('links') ? (
        <div className="customize-pin-block">
          <p className="customize-sheet-copy">Link notes</p>
          <p className="customize-sheet-copy">
            Optional one-liners under each Launch link (face icons stay clean).
          </p>
          <ul className="customize-link-note-list">
            {links.map((link: PortfolioSocialLink) => (
              <li key={link.key} className="customize-link-note-row">
                <label className="customize-link-note-label" htmlFor={`note-${link.key}`}>
                  {link.label}
                </label>
                <input
                  id={`note-${link.key}`}
                  className="os-field-bordered customize-link-note-input"
                  type="text"
                  maxLength={PAGE_LINK_NOTE_MAX}
                  disabled={disabled || saving}
                  placeholder="Short note (optional)"
                  value={notes[link.key] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value.slice(0, PAGE_LINK_NOTE_MAX);
                    setNotes((prev) => {
                      const next = { ...prev };
                      if (!value.trim()) {
                        delete next[link.key];
                      } else {
                        next[link.key] = value;
                      }
                      return next;
                    });
                    markDirty();
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dirty ? (
        <div className="customize-sheet-actions">
          <button
            type="button"
            className="customize-sheet-primary"
            disabled={disabled || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save Launch'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
