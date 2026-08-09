/** Author content labels on PostV1 (`contentWarning`, `nsfw`). */

export interface PostContentLabels {
  contentWarning?: string;
  nsfw?: boolean;
}

export function normalizeComposerContentLabels(input: {
  contentWarning?: string;
  nsfw?: boolean;
}): PostContentLabels {
  const warning = input.contentWarning?.trim();
  return {
    ...(warning ? { contentWarning: warning } : {}),
    ...(input.nsfw ? { nsfw: true } : {}),
  };
}

export function parsePostContentLabels(value: string): PostContentLabels {
  const trimmed = value.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as {
      contentWarning?: unknown;
      nsfw?: unknown;
    };
    const warning =
      typeof parsed.contentWarning === 'string'
        ? parsed.contentWarning.trim()
        : '';
    const nsfw = parsed.nsfw === true;
    return {
      ...(warning ? { contentWarning: warning } : {}),
      ...(nsfw ? { nsfw: true } : {}),
    };
  } catch {
    return {};
  }
}

export function postHasContentLabels(labels: PostContentLabels): boolean {
  return Boolean(labels.nsfw || labels.contentWarning);
}

/** Gate copy when Safe mode hides the body. */
export function sensitiveGateLabel(labels: PostContentLabels): string {
  if (labels.contentWarning) return labels.contentWarning;
  if (labels.nsfw) return 'Sensitive content';
  return 'Sensitive content';
}
