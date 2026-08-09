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

/** How `PostSensitiveGate` should render for the current viewer state. */
export type SensitiveGateMode = 'passthrough' | 'labeled' | 'hide' | 'blur';

export function resolveSensitiveGateMode(
  labels: PostContentLabels,
  safeMode: boolean,
  revealed: boolean
): SensitiveGateMode {
  if (!postHasContentLabels(labels)) return 'passthrough';
  if (!safeMode || revealed) return 'labeled';
  if (labels.nsfw) return 'blur';
  return 'hide';
}

/** Gate copy when Safe mode hides the body. */
export function sensitiveGateLabel(labels: PostContentLabels): string {
  if (labels.contentWarning) return labels.contentWarning;
  if (labels.nsfw) return 'Sensitive content';
  return 'Sensitive content';
}

/**
 * Peek / compact preview copy under Safe mode — never leaks labeled body text.
 * Open the full post to reveal.
 */
export function safeModePeekText(
  text: string,
  labels: PostContentLabels,
  safeMode: boolean
): string {
  if (!safeMode || !postHasContentLabels(labels)) return text;
  return sensitiveGateLabel(labels);
}
