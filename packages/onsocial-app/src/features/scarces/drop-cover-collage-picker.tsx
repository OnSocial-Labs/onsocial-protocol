'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  THEME_MANIFEST,
  type Palette,
} from '@onsocial/text-card';
import { DropImageLightbox } from '@/features/scarces/drop-artwork-preview';
import { ScarceChoiceField } from '@/features/scarces/scarce-choice-field';
import {
  ScarceFinishSwatch,
  ScarceFormatSwatch,
} from '@/features/scarces/scarce-choice-visuals';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  COLLAGE_FONT_DESCRIPTIONS,
  COLLAGE_FONT_LABELS,
  COLLAGE_FONTS,
  COLLAGE_STYLE_LABELS,
  COLLAGE_STYLES,
  DEFAULT_COLLAGE_FONT,
  isCollagePaperDark,
  nextCollageStyle,
  resolveCollagePaperColor,
  STYLE_PAPER,
  type CollageFont,
  type CollageSeatImage,
  type CollageStyle,
  renderVariationCoverCollage,
} from '@/lib/variation-cover-collage';

export type CollagePaper = 'auto' | Palette;

export type DropCoverCollageSelection = {
  style: CollageStyle;
  showTitle: boolean;
  showLabel: boolean;
  paper: CollagePaper;
  /** Packaging title voice — same Format fonts as mint-from-post. */
  font: CollageFont;
  blob: Blob | null;
  previewUrl: string | null;
};

type ChromeDraft = {
  style: CollageStyle;
  showTitle: boolean;
  showLabel: boolean;
  paper: CollagePaper;
  font: CollageFont;
};

type DropCoverCollagePickerProps = {
  images: CollageSeatImage[];
  coverSeat: number;
  uniqueCount: number;
  /** Drop title burned into the packaging cover when showTitle is on. */
  title?: string;
  disabled?: boolean;
  value: DropCoverCollageSelection;
  onChange: (next: DropCoverCollageSelection) => void;
};

function CollageFontSwatch({
  font,
  size = 'option',
}: {
  font: CollageFont;
  size?: 'option' | 'chip';
}) {
  if (font === 'header') {
    return (
      <span
        className={`os-choice-swatch os-choice-swatch--format os-choice-swatch--format-header os-choice-swatch--${size}`}
        aria-hidden
      >
        <span className="os-choice-format-aa">Aa</span>
      </span>
    );
  }
  return <ScarceFormatSwatch format={font} size={size} />;
}

function StyleSwatch({
  style,
  size = 'option',
  paperHex,
}: {
  style: CollageStyle;
  size?: 'option' | 'chip';
  /** Live paper so drawer examples match the cover (esp. Mosaic / Film). */
  paperHex?: string;
}) {
  const paper = paperHex?.trim() || STYLE_PAPER[style];
  const dark = isCollagePaperDark(paper);
  return (
    <span
      className={`drop-collage-style-swatch drop-collage-style-swatch--${style} drop-collage-style-swatch--${size}${
        dark ? ' is-dark' : ''
      }`}
      style={{ ['--drop-collage-swatch-paper' as string]: paper }}
      aria-hidden
    />
  );
}

function paperHexFor(
  style: CollageStyle,
  paper: CollagePaper
): string | null {
  if (paper === 'auto') return null;
  const finish = THEME_MANIFEST.palettes.find((item) => item.key === paper);
  return finish?.bgFrom ?? null;
}

function inkHexFor(paper: CollagePaper): string | null {
  if (paper === 'auto') return null;
  const finish = THEME_MANIFEST.palettes.find((item) => item.key === paper);
  return finish?.textPrimary ?? null;
}

/**
 * Variation Drop packaging cover — thumb + arrows + choice chips
 * (Style / Paper / Title / Label). Tap thumb opens DropImageLightbox.
 */
export function DropCoverCollagePicker({
  images,
  coverSeat,
  uniqueCount,
  title = '',
  disabled = false,
  value,
  onChange,
}: DropCoverCollagePickerProps) {
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const committedPreviewRef = useRef<string | null>(null);

  const revokeCommitted = useCallback(() => {
    if (committedPreviewRef.current) {
      URL.revokeObjectURL(committedPreviewRef.current);
      committedPreviewRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      revokeCommitted();
    },
    [revokeCommitted]
  );

  const renderGenRef = useRef(0);
  const renderCommitted = useCallback(
    async (chrome: ChromeDraft) => {
      if (images.length === 0) {
        revokeCommitted();
        onChange({
          ...chrome,
          blob: null,
          previewUrl: null,
        });
        return;
      }
      onChange({
        ...chrome,
        blob: value.blob,
        previewUrl: value.previewUrl,
      });
      const gen = ++renderGenRef.current;
      setRendering(true);
      setError(null);
      try {
        const blob = await renderVariationCoverCollage({
          images,
          coverSeat,
          uniqueCount,
          style: chrome.style,
          title,
          showTitle: chrome.showTitle,
          showLabel: chrome.showLabel,
          paperColor: paperHexFor(chrome.style, chrome.paper),
          inkColor: inkHexFor(chrome.paper),
          font: chrome.font,
        });
        if (gen !== renderGenRef.current) return;
        revokeCommitted();
        const previewUrl = URL.createObjectURL(blob);
        committedPreviewRef.current = previewUrl;
        onChange({ ...chrome, blob, previewUrl });
      } catch (cause) {
        if (gen !== renderGenRef.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not build the cover collage.'
        );
      } finally {
        if (gen === renderGenRef.current) setRendering(false);
      }
    },
    [
      coverSeat,
      images,
      onChange,
      revokeCommitted,
      title,
      uniqueCount,
      value.blob,
      value.previewUrl,
    ]
  );

  const imageKey = images.map((img) => `${img.seat}:${img.src}`).join('|');
  useEffect(() => {
    void renderCommitted({
      style: value.style,
      showTitle: value.showTitle,
      showLabel: value.showLabel,
      paper: value.paper,
      font: value.font,
    });
    // Seats / cover / title only — chips/arrows call renderCommitted directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [imageKey, coverSeat, uniqueCount, title]);

  const cycle = useCallback(
    (delta: 1 | -1) => {
      if (disabled) return;
      void renderCommitted({
        style: nextCollageStyle(value.style, delta),
        showTitle: value.showTitle,
        showLabel: value.showLabel,
        paper: value.paper,
        font: value.font,
      });
    },
    [
      disabled,
      renderCommitted,
      value.font,
      value.paper,
      value.showLabel,
      value.showTitle,
      value.style,
    ]
  );

  const paperOptions = useMemo(() => {
    const autoHex = resolveCollagePaperColor(value.style, null);
    return [
      {
        value: 'auto' as const,
        label: 'Auto',
        description: 'Default for this style',
        leading: (
          <ScarceFinishSwatch
            bgFrom={autoHex}
            bgTo={autoHex}
            textPrimary={
              autoHex === STYLE_PAPER.mosaic || autoHex === STYLE_PAPER.film
                ? '#F5F0E8'
                : '#0B0B0F'
            }
          />
        ),
      },
      ...THEME_MANIFEST.palettes.map((item) => ({
        value: item.key as Palette,
        label: item.label,
        description: item.tagline,
        leading: (
          <ScarceFinishSwatch
            bgFrom={item.bgFrom}
            bgTo={item.bgTo}
            textPrimary={item.textPrimary}
          />
        ),
      })),
    ];
  }, [value.style]);

  if (images.length === 0) return null;

  const activePaper = THEME_MANIFEST.palettes.find(
    (item) => item.key === value.paper
  );
  const chipPaperHex = resolveCollagePaperColor(
    value.style,
    paperHexFor(value.style, value.paper)
  );
  const styleOptions = COLLAGE_STYLES.map((style) => {
    // Each option previews on the paper that style would use (Auto vs Finish).
    const optionPaper =
      value.paper === 'auto'
        ? STYLE_PAPER[style]
        : chipPaperHex;
    return {
      value: style,
      label: COLLAGE_STYLE_LABELS[style],
      leading: <StyleSwatch style={style} paperHex={optionPaper} />,
    };
  });
  const fontOptions = COLLAGE_FONTS.map((font) => ({
    value: font,
    label: COLLAGE_FONT_LABELS[font],
    description: COLLAGE_FONT_DESCRIPTIONS[font],
    leading: <CollageFontSwatch font={font} />,
  }));
  const titleDisabled = disabled || rendering || !title.trim();
  const chromeDisabled = disabled || rendering;

  return (
    <div className="guild-field drop-collage-field">
      <span>Drop cover</span>
      <div className="drop-collage-picker-row">
        <button
          type="button"
          className="drop-collage-arrow"
          aria-label="Previous cover style"
          disabled={disabled || rendering}
          onClick={() => cycle(-1)}
        >
          ‹
        </button>
        {/* Same grid cell + seat chrome as “Your set”. */}
        <div className="drop-cover-seat-grid drop-collage-thumb-grid">
          <div className="drop-cover-seat-shell">
            <button
              type="button"
              className="drop-cover-seat drop-cover-seat--zoom"
              disabled={disabled || !value.previewUrl}
              aria-label="Zoom drop cover"
              aria-haspopup="dialog"
              aria-expanded={zoomOpen}
              onClick={() => {
                if (value.previewUrl) setZoomOpen(true);
              }}
            >
              {value.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob preview
                <img src={value.previewUrl} alt="" />
              ) : (
                <span className="drop-collage-thumb-empty">
                  {rendering ? '…' : 'Cover'}
                </span>
              )}
            </button>
          </div>
        </div>
        <button
          type="button"
          className="drop-collage-arrow"
          aria-label="Next cover style"
          disabled={disabled || rendering}
          onClick={() => cycle(1)}
        >
          ›
        </button>
      </div>

      <div
        className="app-storage-presets os-choice-chip-row"
        role="group"
        aria-label="Cover options"
      >
        <ScarceChoiceField
          label="Style"
          value={value.style}
          options={styleOptions}
          disabled={disabled || rendering}
          copy="Packaging collage layout."
          chipLeading={
            <StyleSwatch
              style={value.style}
              size="chip"
              paperHex={chipPaperHex}
            />
          }
          onChange={(style) =>
            void renderCommitted({
              style,
              showTitle: value.showTitle,
              showLabel: value.showLabel,
              paper: value.paper,
                    font: value.font,
            })
          }
        />
        <ScarceChoiceField
          label="Paper"
          value={value.paper}
          options={paperOptions}
          disabled={disabled || rendering}
          copy="Background finish — same papers as mint-from-post cards."
          chipLeading={
            <ScarceFinishSwatch
              bgFrom={chipPaperHex}
              bgTo={activePaper?.bgTo ?? chipPaperHex}
              textPrimary={
                activePaper?.textPrimary ??
                (chipPaperHex === STYLE_PAPER.mosaic ||
                chipPaperHex === STYLE_PAPER.film
                  ? '#F5F0E8'
                  : '#0B0B0F')
              }
              size="chip"
            />
          }
          onChange={(paper) =>
            void renderCommitted({
              style: value.style,
              showTitle: value.showTitle,
              showLabel: value.showLabel,
              paper,
              font: value.font,
            })
          }
        />
        <ScarceChoiceField
          label="Font"
          value={value.font}
          options={fontOptions}
          disabled={disabled || rendering}
          copy="Title voice — same Formats as mint-from-post cards."
          chipLeading={<CollageFontSwatch font={value.font} size="chip" />}
          onChange={(font) =>
            void renderCommitted({
              style: value.style,
              showTitle: value.showTitle,
              showLabel: value.showLabel,
              paper: value.paper,
              font,
            })
          }
        />
        {/* Binary chrome — tap toggles; no two-option sheet. */}
        <button
          type="button"
          className={`os-surface-chip os-choice-chip${
            value.showTitle ? ' is-selected' : ''
          }`}
          disabled={titleDisabled}
          aria-pressed={value.showTitle}
          aria-label={`Title: ${value.showTitle ? 'On' : 'Off'}`}
          onClick={() => {
            if (titleDisabled) return;
            void renderCommitted({
              style: value.style,
              showTitle: !value.showTitle,
              showLabel: value.showLabel,
              paper: value.paper,
                    font: value.font,
            });
          }}
        >
          <span className="os-choice-chip-label">Title</span>
          <span className="os-choice-chip-value">
            {value.showTitle ? 'On' : 'Off'}
          </span>
        </button>
        <button
          type="button"
          className={`os-surface-chip os-choice-chip${
            value.showLabel ? ' is-selected' : ''
          }`}
          disabled={chromeDisabled}
          aria-pressed={value.showLabel}
          aria-label={`Label: ${value.showLabel ? 'On' : 'Off'}`}
          onClick={() => {
            if (chromeDisabled) return;
            void renderCommitted({
              style: value.style,
              showTitle: value.showTitle,
              showLabel: !value.showLabel,
              paper: value.paper,
                    font: value.font,
            });
          }}
        >
          <span className="os-choice-chip-label">Label</span>
          <span className="os-choice-chip-value">
            {value.showLabel ? 'On' : 'Off'}
          </span>
        </button>
      </div>

      <small>
        {COLLAGE_STYLE_LABELS[value.style]}
        {value.paper !== 'auto'
          ? ` · ${activePaper?.label ?? value.paper}`
          : ''}
        {uniqueCount > 0 ? ` · ${uniqueCount.toLocaleString()} unique` : ''}
        {' — '}
        tap cover to zoom · arrows flip style.
      </small>
      {error ? <small className="drop-collage-error">{error}</small> : null}

      {value.previewUrl ? (
        <DropImageLightbox
          open={zoomOpen}
          src={value.previewUrl}
          label="Drop cover"
          onClose={() => setZoomOpen(false)}
          onPrev={() => cycle(-1)}
          onNext={() => cycle(1)}
          footer={
            <div className="drop-collage-lightbox-controls">
              <div className="drop-collage-lightbox-controls-row">
                <ScarceChoiceField
                  label="Style"
                  value={value.style}
                  options={styleOptions}
                  disabled={disabled || rendering}
                  copy="Packaging collage layout."
                  chipLeading={
                    <StyleSwatch
                      style={value.style}
                      size="chip"
                      paperHex={chipPaperHex}
                    />
                  }
                  zIndex={SHEET_Z.lightboxNested}
                  onChange={(style) =>
                    void renderCommitted({
                      style,
                      showTitle: value.showTitle,
                      showLabel: value.showLabel,
                      paper: value.paper,
                    font: value.font,
                    })
                  }
                />
                <ScarceChoiceField
                  label="Paper"
                  value={value.paper}
                  options={paperOptions}
                  disabled={disabled || rendering}
                  copy="Background finish — same papers as mint-from-post cards."
                  chipLeading={
                    <ScarceFinishSwatch
                      bgFrom={chipPaperHex}
                      bgTo={activePaper?.bgTo ?? chipPaperHex}
                      textPrimary={
                        activePaper?.textPrimary ??
                        (chipPaperHex === STYLE_PAPER.mosaic ||
                        chipPaperHex === STYLE_PAPER.film
                          ? '#F5F0E8'
                          : '#0B0B0F')
                      }
                      size="chip"
                    />
                  }
                  zIndex={SHEET_Z.lightboxNested}
                  onChange={(paper) =>
                    void renderCommitted({
                      style: value.style,
                      showTitle: value.showTitle,
                      showLabel: value.showLabel,
                      paper,
                      font: value.font,
                    })
                  }
                />
                <ScarceChoiceField
                  label="Font"
                  value={value.font}
                  options={fontOptions}
                  disabled={disabled || rendering}
                  copy="Title voice — same Formats as mint-from-post cards."
                  chipLeading={
                    <CollageFontSwatch font={value.font} size="chip" />
                  }
                  zIndex={SHEET_Z.lightboxNested}
                  onChange={(font) =>
                    void renderCommitted({
                      style: value.style,
                      showTitle: value.showTitle,
                      showLabel: value.showLabel,
                      paper: value.paper,
                      font,
                    })
                  }
                />
              </div>
              <div className="drop-collage-lightbox-controls-row">
                <button
                  type="button"
                  className={`os-surface-chip os-choice-chip${
                    value.showTitle ? ' is-selected' : ''
                  }`}
                  disabled={titleDisabled}
                  aria-pressed={value.showTitle}
                  aria-label={`Title: ${value.showTitle ? 'On' : 'Off'}`}
                  onClick={() => {
                    if (titleDisabled) return;
                    void renderCommitted({
                      style: value.style,
                      showTitle: !value.showTitle,
                      showLabel: value.showLabel,
                      paper: value.paper,
                    font: value.font,
                    });
                  }}
                >
                  <span className="os-choice-chip-label">Title</span>
                  <span className="os-choice-chip-value">
                    {value.showTitle ? 'On' : 'Off'}
                  </span>
                </button>
                <button
                  type="button"
                  className={`os-surface-chip os-choice-chip${
                    value.showLabel ? ' is-selected' : ''
                  }`}
                  disabled={chromeDisabled}
                  aria-pressed={value.showLabel}
                  aria-label={`Label: ${value.showLabel ? 'On' : 'Off'}`}
                  onClick={() => {
                    if (chromeDisabled) return;
                    void renderCommitted({
                      style: value.style,
                      showTitle: value.showTitle,
                      showLabel: !value.showLabel,
                      paper: value.paper,
                    font: value.font,
                    });
                  }}
                >
                  <span className="os-choice-chip-label">Label</span>
                  <span className="os-choice-chip-value">
                    {value.showLabel ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

export function emptyCollageSelection(
  style: CollageStyle = 'pack',
  showLabel = false,
  showTitle = true,
  paper: CollagePaper = 'auto',
  font: CollageFont = DEFAULT_COLLAGE_FONT
): DropCoverCollageSelection {
  return {
    style,
    showTitle,
    showLabel,
    paper,
    font,
    blob: null,
    previewUrl: null,
  };
}
