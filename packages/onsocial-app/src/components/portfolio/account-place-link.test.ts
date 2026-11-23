import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { feedPanelHopHref, isWritingShelfHref } from './account-place-link';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'account-place-link.tsx'), 'utf8');

describe('feed panel hop', () => {
  it('opens the author face directly from Home', () => {
    expect(
      feedPanelHopHref(
        '/home',
        '/@alice.testnet?essay=42&from=%2Fhome'
      )
    ).toBeNull();
  });

  it('reaches Writing from the face so Home does not intercept it', () => {
    expect(
      feedPanelHopHref(
        '/home',
        '/@alice.testnet/writing?essay=42&from=%2Fhome'
      )
    ).toBe('/@alice.testnet?essay=42&from=%2Fhome&shelf=%2Fwriting');
  });

  it('leaves a profile-to-shelf link on the real shelf path', () => {
    expect(
      feedPanelHopHref(
        '/@alice.testnet',
        '/@alice.testnet/writing?essay=42&from=%2Fhome'
      )
    ).toBeNull();
  });

  it('would face-hop Writing from Collectibles (assign uses solid page instead)', () => {
    expect(
      feedPanelHopHref('/collectibles', '/@alice.testnet/writing')
    ).toBe('/@alice.testnet?shelf=%2Fwriting');
  });
});

describe('Writing place navigation', () => {
  it('recognizes Writing shelf and article hrefs', () => {
    expect(isWritingShelfHref('/@alice.testnet/writing')).toBe(true);
    expect(isWritingShelfHref('/@alice.testnet/writing/42')).toBe(true);
    expect(isWritingShelfHref('/@alice.testnet')).toBe(false);
  });

  it('hard-assigns every Writing shelf / article href', () => {
    expect(source).toContain('isWritingShelfHref(target)');
    expect(source).toContain('window.location.assign(target)');
    expect(source).toContain('endPortfolioShelfHop');
    expect(source).not.toContain('shouldSolidAssignWritingShelf');
  });
});
