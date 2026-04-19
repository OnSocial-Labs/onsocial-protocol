// ---------------------------------------------------------------------------
// Template registry — maps template IDs to render functions
// ---------------------------------------------------------------------------

import type { PageData } from '../types.js';
import { minimal } from './minimal.js';
import { creator } from './creator.js';

export type TemplateFn = (data: PageData) => string;

const templates: Record<string, TemplateFn> = {
  minimal,
  creator,
};

/**
 * Resolve a template by ID, falling back to `minimal`.
 */
export function getTemplate(id?: string): TemplateFn {
  if (id && id in templates) return templates[id];
  return minimal;
}
