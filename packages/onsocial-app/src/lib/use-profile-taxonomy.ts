'use client';

import { useCallback, useMemo } from 'react';
import type { ChoiceOption } from '@onsocial/ui';
import { useTranslations } from 'next-intl';
import { profileIdentityTopicLabel } from '@/lib/profile-identity-topics';
import {
  craftMessageKey,
  industryFallbackKey,
  industryHintKey,
  industryMessageKey,
  taxonomyChoiceLabelKey,
  taxonomyDescriptionMessage,
  taxonomySectionKey,
} from '@/lib/profile-taxonomy-label';

type ShellTranslator = {
  (key: string): string;
  (key: string, values: Record<string, string | number>): string;
};

function useShellTranslator(): ShellTranslator {
  return useTranslations('shell') as unknown as ShellTranslator;
}

function translateMessage(
  t: ShellTranslator,
  message: { key: string; values?: { count: number } }
): string {
  return message.values ? t(message.key, message.values) : t(message.key);
}

/** Known industries use the catalog. A typed sector stays as stored. */
export function useIndustryLabel(): (value: string) => string {
  const t = useShellTranslator();
  return useCallback(
    (value: string) => {
      const key = industryMessageKey(value);
      return key ? t(key) : value;
    },
    [t]
  );
}

/** Seed crafts use the catalog. A typed craft keeps its sentence-case label. */
export function useCraftLabel(): (slug: string) => string {
  const t = useShellTranslator();
  return useCallback(
    (slug: string) => {
      const key = craftMessageKey(slug);
      return key ? t(key) : profileIdentityTopicLabel(slug);
    },
    [t]
  );
}

export function useIndustryFallbackLabel(label: string): string {
  const t = useShellTranslator();
  const key = industryFallbackKey(label);
  return key ? t(key) : label;
}

export function useIndustryHint(hint: string): string {
  const t = useShellTranslator();
  const key = industryHintKey(hint);
  return key ? t(key) : hint;
}

/** Picker rows. Values stay the stored English id. Labels, sections, and counts translate. */
export function useTaxonomyChoices<T extends string>(
  options: readonly ChoiceOption<T>[]
): ChoiceOption<T>[] {
  const t = useShellTranslator();
  return useMemo(
    () =>
      options.map((option) => {
        const labelKey = taxonomyChoiceLabelKey(option);
        const sectionKey = option.section
          ? taxonomySectionKey(option.section)
          : null;
        const description = option.description
          ? taxonomyDescriptionMessage(option.description)
          : null;
        return {
          ...option,
          label: labelKey ? t(labelKey) : option.label,
          section: sectionKey ? t(sectionKey) : option.section,
          description: description
            ? translateMessage(t, description)
            : option.description,
        };
      }),
    [options, t]
  );
}
