import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const bubble = readFileSync(join(here, 'dm-bubble-text.tsx'), 'utf8');
const panel = readFileSync(join(here, 'messages-panel.tsx'), 'utf8');
const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('dm bubble rich text', () => {
  it('reuses post autolink chips and does not unfurl', () => {
    expect(bubble).toContain("from '@/features/home/post-rich-text'");
    expect(bubble).toContain('<PostRichText text={text} />');
    expect(bubble).not.toMatch(/fetch\(|openGraph|preview.?card/i);
  });

  it('renders decrypted bodies through DmBubbleText, not a raw paragraph', () => {
    expect(panel).toContain('DmBubbleText');
    expect(panel).toContain('<DmBubbleText text={text} />');
    expect(panel).toContain('isDmDecryptFailureText(text)');
  });

  it('lets URL chips wrap inside the bubble', () => {
    expect(css).toMatch(
      /\.messages-bubble-text \{\s*overflow-wrap: anywhere;/
    );
    expect(css).toMatch(
      /\.messages-bubble-text \.os-link \{\s*white-space: normal;/
    );
  });
});
