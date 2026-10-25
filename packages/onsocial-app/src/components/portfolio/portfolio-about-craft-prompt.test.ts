import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const prompt = readFileSync(
  join(here, 'portfolio-about-craft-prompt.tsx'),
  'utf8'
);
const panel = readFileSync(join(here, 'portfolio-about-panel.tsx'), 'utf8');
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('about craft prompt', () => {
  it('is one inline field — Enter saves the tag direct, no form or save button', () => {
    expect(prompt).toContain('What’s your craft?');
    expect(prompt).toContain('client.profiles.update');
    expect(prompt).toContain('{ wait: true }');
    expect(prompt).toContain("event.key !== 'Enter'");
    expect(prompt).not.toContain('<form');
    expect(prompt).not.toContain('OsSheetAction');
  });

  it('is skippable with the dismissal persisted per account', () => {
    expect(prompt).toContain('writeAboutCraftPromptDismissed(accountId)');
    expect(prompt).toContain('aria-label="Skip craft prompt"');
    expect(prompt).toContain('readAboutCraftPromptDismissed(accountId)');
  });

  it('stays owner-gated and hidden once crafts exist', () => {
    expect(prompt).toContain('shouldShowAboutCraftPrompt');
    expect(prompt).toContain('hasCrafts: existing.length > 0');
  });

  it('sits at the top of the About panel', () => {
    expect(panel).toContain('<PortfolioAboutCraftPrompt');
    expect(panel.indexOf('<PortfolioAboutCraftPrompt')).toBeLessThan(
      panel.indexOf('portfolio-about-spread')
    );
  });

  it('styles the quiet line, the input, and the skip control', () => {
    expect(globalsCss).toContain('.portfolio-about-craft-prompt {');
    expect(globalsCss).toContain('.portfolio-about-craft-prompt-input {');
    expect(globalsCss).toContain('.portfolio-about-craft-prompt-skip {');
  });
});
