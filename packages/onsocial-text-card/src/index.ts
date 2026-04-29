export {
  generateTextCardSvg,
  previewTextCard,
  type TextCardOptions,

  // v0.3.1 — per-card customisation
  MARK_COLORS,
  MARK_SHAPES,
  isMarkColor,
  isMarkShape,
  isTitleAlign,
  type MarkColor,
  type MarkShape,
  type TitleAlign,

  // v0.4 — title auto-shrink + UI fit measurement
  measureTitleFit,
  type TitleFit,
  type TitleFitStatus,
} from './generator.js';
export {
  // v0.2 — moods
  MOODS,
  DEFAULT_MOOD,
  resolveMood,
  isMoodKey,
  type Mood,
  type MoodKey,

  // v0.5 — voice × palette grid axes (for two-axis pickers)
  VOICES,
  PALETTES,
  splitMoodKey,
  composeMoodKey,
  type Voice,
  type Palette,
  type StandardMoodKey,
  type SpecialMoodKey,

  // Manifest (auto-derived chip data)
  THEME_MANIFEST,

  // v0.1 backwards-compatibility shims
  BACKGROUNDS,
  DEFAULT_THEME,
  resolveTheme,
  isBackgroundKey,
  isFontKey,
  type BackgroundKey,
  type FontKey,
} from './themes.js';
