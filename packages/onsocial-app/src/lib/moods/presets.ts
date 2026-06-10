import type { BuiltInMoodId, MoodPreset } from '@/lib/moods/types';

export const BUILT_IN_MOOD_IDS = [
  'default',
  'lead',
  'business',
  'creative',
  'celebration',
] as const satisfies readonly BuiltInMoodId[];

export const MOOD_PRESETS: Record<BuiltInMoodId, MoodPreset> = {
  default: {
    id: 'default',
    label: 'Default',
    tagline: 'Clean portfolio — no mood selected.',
    included: true,
    theme: {
      background: '#050505',
      text: 'rgb(255 255 255 / 0.96)',
      muted: 'rgb(255 255 255 / 0.42)',
      accent: 'rgb(255 255 255 / 0.72)',
      banner: 'linear-gradient(135deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02))',
      surface: 'rgb(255 255 255 / 0.03)',
    },
  },
  lead: {
    id: 'lead',
    label: 'Lead',
    tagline: 'Executive presence — sharp, confident, high contrast.',
    included: true,
    theme: {
      background: '#070605',
      text: 'rgb(255 252 245 / 0.96)',
      muted: 'rgb(255 248 235 / 0.44)',
      accent: 'rgb(212 175 106 / 0.95)',
      banner:
        'linear-gradient(135deg, rgb(212 175 106 / 0.18), rgb(255 255 255 / 0.03))',
      surface: 'rgb(212 175 106 / 0.06)',
    },
  },
  business: {
    id: 'business',
    label: 'Business',
    tagline: 'Professional, restrained, trust-first presentation.',
    included: true,
    theme: {
      background: '#040608',
      text: 'rgb(240 246 255 / 0.96)',
      muted: 'rgb(180 198 220 / 0.48)',
      accent: 'rgb(120 176 255 / 0.92)',
      banner:
        'linear-gradient(135deg, rgb(120 176 255 / 0.16), rgb(255 255 255 / 0.03))',
      surface: 'rgb(120 176 255 / 0.06)',
    },
  },
  creative: {
    id: 'creative',
    label: 'Creative',
    tagline: 'Expressive energy for makers, artists, and builders.',
    included: true,
    theme: {
      background: '#06040a',
      text: 'rgb(255 250 255 / 0.96)',
      muted: 'rgb(230 210 255 / 0.46)',
      accent: 'rgb(186 132 255 / 0.92)',
      banner:
        'linear-gradient(135deg, rgb(186 132 255 / 0.2), rgb(255 120 180 / 0.08))',
      surface: 'rgb(186 132 255 / 0.07)',
    },
  },
  celebration: {
    id: 'celebration',
    label: 'Celebration',
    tagline: 'Mark a moment — launch, milestone, or thank-you.',
    included: true,
    theme: {
      background: '#0a0508',
      text: 'rgb(255 250 252 / 0.96)',
      muted: 'rgb(255 210 220 / 0.48)',
      accent: 'rgb(255 120 160 / 0.95)',
      banner:
        'linear-gradient(135deg, rgb(255 120 160 / 0.22), rgb(255 200 100 / 0.12))',
      surface: 'rgb(255 120 160 / 0.08)',
    },
  },
};

export const MOOD_PRESET_LIST = BUILT_IN_MOOD_IDS.map((id) => MOOD_PRESETS[id]);

export function isBuiltInMoodId(value: string): value is BuiltInMoodId {
  return (BUILT_IN_MOOD_IDS as readonly string[]).includes(value);
}
