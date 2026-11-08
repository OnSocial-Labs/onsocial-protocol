'use client';

/**
 * Crafts editor — curated pick list (like industry) + write-in, max 3.
 * Masthead variant matches the live About · line (tap to edit; drawer removes).
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChoiceDrawer,
  MultiplyIcon,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import {
  buildProfileCraftEditorOptions,
  PROFILE_CRAFT_WRITE_IN,
  profileCraftDrawerValue,
} from '@/lib/profile-craft-suggestions';
import { useTranslations } from 'next-intl';
import { useCraftLabel, useTaxonomyChoices } from '@/lib/use-profile-taxonomy';
import {
  PROFILE_EDITOR_MAX_TAG_LENGTH,
  PROFILE_EDITOR_MAX_TAGS,
  removeProfileEditorTag,
  tryAddProfileEditorTag,
  type ProfileEditorTagCommitHint,
} from '@/lib/profile-tag-editor';
import { formatTopicDraftInput } from '@/lib/topic-slug';
import { SHEET_Z } from '@/lib/sheet-z';

interface ProfileTopicsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  /** Quiet About masthead — middot line only; drawer handles add/remove. */
  variant?: 'default' | 'masthead';
}

export function ProfileTopicsEditor({
  tags,
  onChange,
  disabled = false,
  variant = 'default',
}: ProfileTopicsEditorProps) {
  const t = useTranslations('shell');
  const craftName = useCraftLabel();
  const writeFormId = useId();
  const writeInputRef = useRef<HTMLInputElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [writeDraft, setWriteDraft] = useState('');
  const [hint, setHint] = useState<ProfileEditorTagCommitHint | null>(null);
  const atMax = tags.length >= PROFILE_EDITOR_MAX_TAGS;
  const options = useTaxonomyChoices(
    useMemo(() => buildProfileCraftEditorOptions(tags), [tags])
  );
  const masthead = variant === 'masthead';

  useEffect(() => {
    if (!writeOpen) return;
    window.setTimeout(() => writeInputRef.current?.focus(), 0);
  }, [writeOpen]);

  const openPicker = () => {
    if (disabled) return;
    setHint(null);
    setPickerOpen(true);
  };

  const handleChoice = (next: string) => {
    if (disabled) return;
    if (next === PROFILE_CRAFT_WRITE_IN) {
      setWriteDraft('');
      setWriteOpen(true);
      setPickerOpen(false);
      return;
    }

    if (tags.includes(next)) {
      onChange(removeProfileEditorTag(tags, next));
      setHint(null);
      return;
    }

    const result = tryAddProfileEditorTag(tags, next);
    onChange(result.tags);
    setHint(result.hint);
  };

  const commitWriteIn = () => {
    if (disabled) return;
    const result = tryAddProfileEditorTag(tags, writeDraft);
    onChange(result.tags);
    setHint(result.hint);
    if (!result.hint || result.hint === 'Already added') {
      setWriteOpen(false);
      setWriteDraft('');
    }
  };

  const craftNames = tags.map(craftName).join(' · ');
  const craftsAria =
    tags.length === 0
      ? t('taxonomy.chooseCrafts')
      : t('taxonomy.changeCrafts', { names: craftNames });
  const hintText =
    hint === 'Already added'
      ? t('topicEditor.alreadyAdded')
      : hint === 'Max 3 crafts'
        ? t('taxonomy.maxCrafts')
        : null;

  return (
    <div
      className={`account-editor-topics${masthead ? ' account-editor-topics--masthead' : ''}`}
    >
      <div className="account-editor-topics-face">
        {masthead ? (
          <button
            type="button"
            className={`account-editor-topics-masthead-trigger${
              tags.length === 0 ? ' is-empty' : ''
            }`}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen || writeOpen}
            aria-label={craftsAria}
            onClick={openPicker}
          >
            {tags.length === 0 ? (
              t('taxonomy.craftExamples')
            ) : (
              <span className="portfolio-topics account-editor-topics-list">
                {tags.map((slug, index) => (
                  <span key={slug} className="portfolio-topics-item">
                    {index > 0 ? (
                      <span className="portfolio-topics-sep" aria-hidden>
                        ·
                      </span>
                    ) : null}
                    <span className="portfolio-topics-label">
                      {craftName(slug)}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </button>
        ) : (
          <>
            {tags.length > 0 ? (
              <ul className="portfolio-topics account-editor-topics-list">
                {tags.map((slug, index) => (
                  <li key={slug} className="portfolio-topics-item">
                    {index > 0 ? (
                      <span className="portfolio-topics-sep" aria-hidden>
                        ·
                      </span>
                    ) : null}
                    <span className="portfolio-topics-label">
                      {craftName(slug)}
                    </span>
                    <button
                      type="button"
                      className="account-editor-topic-remove"
                      aria-label={t('topicEditor.remove', {
                        name: craftName(slug),
                      })}
                      disabled={disabled}
                      onClick={() => {
                        onChange(removeProfileEditorTag(tags, slug));
                        setHint(null);
                      }}
                    >
                      <MultiplyIcon
                        aria-hidden
                        className="account-editor-topic-remove-icon"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className={`account-editor-topics-trigger${
                tags.length === 0 ? ' is-empty' : ''
              }`}
              disabled={disabled}
              aria-haspopup="dialog"
              aria-expanded={pickerOpen || writeOpen}
              aria-label={craftsAria}
              onClick={openPicker}
            >
              {tags.length === 0
                ? t('taxonomy.craftExamples')
                : atMax
                  ? t('taxonomy.change')
                  : t('taxonomy.add')}
            </button>
          </>
        )}
      </div>
      {hintText && !masthead ? (
        <p className="account-editor-topics-hint" role="alert">
          {hintText}
        </p>
      ) : null}

      <ChoiceDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        label={t('taxonomy.sectionCrafts')}
        copy={t('taxonomy.craftLimit')}
        value={profileCraftDrawerValue(tags)}
        options={options}
        onChange={handleChoice}
        closeOnSelect={false}
        zIndex={SHEET_Z.confirm}
      />

      <OsHugSheet
        open={writeOpen}
        onClose={() => setWriteOpen(false)}
        label={t('taxonomy.yourCraft')}
        closeAriaLabel={t('taxonomy.closeCraft')}
        backdropLabel={t('taxonomy.closeCraft')}
        zIndex={SHEET_Z.confirm}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready={writeDraft.trim().length > 0}
                disabled={disabled || writeDraft.trim().length === 0}
                onClick={commitWriteIn}
              >
                {t('taxonomy.addCraft')}
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <div className="account-editor-org-meta-field">
          <label className="guild-field" htmlFor={`${writeFormId}-input`}>
            <span>{t('discover.craft')}</span>
            <input
              ref={writeInputRef}
              id={`${writeFormId}-input`}
              className={osFieldBorderedClassName}
              value={writeDraft}
              maxLength={PROFILE_EDITOR_MAX_TAG_LENGTH}
              autoComplete="organization-title"
              placeholder={t('taxonomy.craftPlaceholder')}
              disabled={disabled}
              onFocus={scrollFieldIntoView}
              onChange={(event) =>
                setWriteDraft(formatTopicDraftInput(event.target.value))
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (writeDraft.trim()) commitWriteIn();
              }}
            />
          </label>
        </div>
      </OsHugSheet>
    </div>
  );
}
