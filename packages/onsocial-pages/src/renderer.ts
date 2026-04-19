// ---------------------------------------------------------------------------
// Renderer — composes the full HTML document from template + OG tags
// ---------------------------------------------------------------------------

import { ogTags } from './og.js';
import { editModeScript } from './edit.js';
import { getTemplate } from './templates/index.js';
import type { PageData } from './types.js';

export interface RenderOptions {
  /** Is the viewer the page owner? If true, inject inline edit UI. */
  isOwner?: boolean;
  /** Gateway API URL for save calls. */
  apiUrl?: string;
}

/**
 * Render a complete HTML page for the given page data.
 */
export function renderPage(
  data: PageData,
  requestUrl: string,
  options?: RenderOptions
): string {
  const template = getTemplate(data.config.template);
  const body = template(data);
  const og = ogTags(data, requestUrl);
  const name = data.profile.name ?? data.accountId;

  // Sanitise customCss — strip any </style> or script injection attempts
  let customCss = '';
  if (data.config.customCss) {
    customCss = data.config.customCss
      .replace(/<\/style/gi, '')
      .replace(/<script/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/expression\s*\(/gi, '');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escHtml(name)} — OnSocial</title>
    ${og}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    ${customCss ? `<style>${customCss}</style>` : ''}
</head>
<body>
    ${body}
    <script>
    // Stub actions — will be replaced with NEAR wallet integration
    function standWith(accountId) {
      window.open('https://portal.onsocial.id/stand/' + encodeURIComponent(accountId), '_blank');
    }
    function support(accountId) {
      window.open('https://portal.onsocial.id/support/' + encodeURIComponent(accountId), '_blank');
    }
    </script>
    ${options?.isOwner ? editModeScript(data.accountId, options.apiUrl ?? 'https://api.onsocial.id', data.config) : ''}
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
