'use client';

import { useMemo, type CSSProperties } from 'react';
import {
  DEFAULT_MOOD,
  MOODS,
  previewTextCard,
  type CardFormat,
  type MarkColor,
  type MarkShape,
  type MoodKey,
} from '@onsocial/text-card';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import { ScarceChoiceField } from '@/features/scarces/scarce-choice-field';
import {
  ScarceCardMoodPicker,
  type ScarceCardThemeOptions,
} from '@/features/scarces/scarce-card-mood-picker';
import { ScarceCoverIcon } from '@/features/scarces/scarce-choice-visuals';
import { scarceNestZIndex } from '@/features/scarces/scarce-overlay-z';

/** Formats available when pinning an article text-card (no photo layouts). */
export const ARTICLE_COVER_FORMATS = [
  'thought',
  'poster',
  'letter',
  'journal',
  'mono',
] as const satisfies readonly CardFormat[];

export type ArticleCoverFace = 'photo' | 'card';

const ARTICLE_COVER_FACE_OPTIONS = [
  {
    value: 'card' as const,
    label: 'Text card',
    leading: <ScarceCoverIcon mode="card" />,
  },
  {
    value: 'photo' as const,
    label: 'Photo',
    leading: <ScarceCoverIcon mode="photo" />,
  },
];

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

/** Live text-card preview — no provenance line before the piece exists. */
export function ComposerArticleCoverPreview({
  title,
  accountId,
  displayName,
  avatarUrl,
  mood,
  format = 'thought',
  markShape = 'rule',
  markColor = 'auto',
}: {
  title: string;
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  mood: MoodKey;
  format?: CardFormat;
  markShape?: MarkShape;
  markColor?: MarkColor;
}) {
  const svg = useMemo(() => {
    const { svg: markup } = previewTextCard({
      title: title.trim() || 'Untitled',
      format,
      creator: {
        accountId,
        displayName: displayName?.trim() || accountId,
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
      },
      theme: {
        bg: MOODS[mood] ? mood : DEFAULT_MOOD,
        markShape,
        markColor,
        titleAlign: 'left',
      },
    });
    return inlineSvgMarkup(markup);
  }, [
    accountId,
    avatarUrl,
    displayName,
    format,
    markColor,
    markShape,
    mood,
    title,
  ]);

  return (
    <div
      className="guild-composer-cover-card"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Quiet row under the article title — one Cover face (photo or card).
 * Tap opens the cover sheet.
 */
export function ComposerArticleCoverRow({
  title,
  accountId,
  displayName,
  avatarUrl,
  photoPreviewUrl,
  theme,
  disabled,
  onOpen,
}: {
  title: string;
  accountId: string | null | undefined;
  displayName?: string | null;
  avatarUrl?: string | null;
  photoPreviewUrl: string | null;
  theme: ScarceCardThemeOptions;
  disabled: boolean;
  onOpen: () => void;
}) {
  const moodLabel = MOODS[theme.cardBg]?.label ?? MOODS[DEFAULT_MOOD].label;
  const faceLabel = photoPreviewUrl ? 'Photo' : moodLabel;
  return (
    <button
      type="button"
      className="guild-composer-cover"
      disabled={disabled}
      aria-label={`Article cover: ${faceLabel}. Change cover`}
      onClick={onOpen}
    >
      <span className="guild-composer-cover-thumb" aria-hidden>
        {photoPreviewUrl ? (
          <img alt="" src={photoPreviewUrl} />
        ) : accountId ? (
          <ComposerArticleCoverPreview
            title={title}
            accountId={accountId}
            displayName={displayName}
            avatarUrl={avatarUrl}
            mood={theme.cardBg}
            format={theme.cardFormat}
            markShape={theme.cardMarkShape}
            markColor={theme.cardMarkColor}
          />
        ) : null}
      </span>
      <span className="guild-composer-cover-copy">
        <span className="guild-composer-cover-label">Cover</span>
        <span className="guild-composer-cover-value">{faceLabel}</span>
      </span>
    </button>
  );
}

/**
 * Cover is one object: Photo or Text card. Photo pick/replace/remove lives
 * here — not as a separate post attachment in article mode.
 */
export function ComposerArticleCoverSheet({
  open,
  onClose,
  zIndex,
  title,
  accountId,
  displayName,
  avatarUrl,
  photoPreviewUrl,
  theme,
  disabled = false,
  panelStyle,
  onThemeChange,
  onPickPhoto,
  onRemovePhoto,
}: {
  open: boolean;
  onClose: () => void;
  zIndex: number;
  title: string;
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  photoPreviewUrl: string | null;
  theme: ScarceCardThemeOptions;
  disabled?: boolean;
  panelStyle?: CSSProperties;
  onThemeChange: (theme: ScarceCardThemeOptions) => void;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
}) {
  const nestZ = scarceNestZIndex(zIndex);
  const moodLabel = MOODS[theme.cardBg]?.label ?? MOODS[DEFAULT_MOOD].label;
  const face: ArticleCoverFace = photoPreviewUrl ? 'photo' : 'card';

  const selectFace = (next: ArticleCoverFace) => {
    if (disabled) return;
    if (next === 'photo') {
      // Commit Photo only after a file is chosen — same as listing cover.
      onPickPhoto();
      return;
    }
    if (photoPreviewUrl) onRemovePhoto();
  };

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      chrome="choice"
      label="Cover"
      closeAriaLabel="Close"
      backdropLabel="Close cover picker"
      zIndex={zIndex}
      bodyClassName="guild-composer-cover-sheet-body"
      panelStyle={panelStyle}
    >
      <div className="guild-composer-cover-preview" aria-hidden>
        {photoPreviewUrl ? (
          <img alt="" src={photoPreviewUrl} />
        ) : (
          <ComposerArticleCoverPreview
            title={title}
            accountId={accountId}
            displayName={displayName}
            avatarUrl={avatarUrl}
            mood={theme.cardBg}
            format={theme.cardFormat}
            markShape={theme.cardMarkShape}
            markColor={theme.cardMarkColor}
          />
        )}
      </div>
      <div
        className="app-storage-presets os-choice-chip-row guild-composer-cover-fields"
        role="group"
        aria-label="Cover"
      >
        <ScarceChoiceField
          label="Cover"
          value={face}
          options={ARTICLE_COVER_FACE_OPTIONS}
          disabled={disabled}
          zIndex={nestZ}
          chipLeading={<ScarceCoverIcon mode={face} size="chip" />}
          onChange={selectFace}
        />
        {face === 'card' ? (
          <ScarceCardMoodPicker
            value={theme}
            onChange={onThemeChange}
            disabled={disabled}
            zIndex={nestZ}
            formats={ARTICLE_COVER_FORMATS}
          />
        ) : null}
      </div>
      {face === 'photo' ? (
        <p className="guild-composer-cover-note">
          This photo is the article cover.
        </p>
      ) : (
        <p className="guild-composer-cover-note">
          {moodLabel} — pinned as the article cover when you publish.
        </p>
      )}
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        {face === 'photo' ? (
          <>
            <OsSheetAction
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={onPickPhoto}
            >
              Replace photo
            </OsSheetAction>
            <OsSheetAction
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={onRemovePhoto}
            >
              Use text card
            </OsSheetAction>
          </>
        ) : (
          <OsSheetAction
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={onPickPhoto}
          >
            Use a photo instead
          </OsSheetAction>
        )}
        <OsSheetAction type="button" variant="primary" onClick={onClose}>
          Done
        </OsSheetAction>
      </OsSheetActions>
    </OsHugSheet>
  );
}
