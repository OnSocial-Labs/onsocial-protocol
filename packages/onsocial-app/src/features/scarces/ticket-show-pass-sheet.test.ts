import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, 'ticket-show-pass-sheet.tsx'), 'utf8');
const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('TicketShowPassSheet layout', () => {
  it('reserves when and place so Expired does not jump', () => {
    expect(sheet).toContain('ticket-show-pass-when');
    expect(sheet).toContain('is-reserved');
    expect(sheet).toContain('When');
    expect(sheet).toContain('Place');
    expect(sheet).toContain('ticket-show-pass-status-slot');
  });

  it('keeps the white QR plate for a code or owner prepare only', () => {
    expect(sheet).toContain('showQrPlate');
    expect(sheet).toContain('preparingOwnerCode');
    expect(sheet).toContain('ticket-show-pass-qr-note');
    expect(css).toContain('.ticket-show-pass-qr-note');
    expect(css).toContain('.ticket-show-pass-when.is-reserved');
  });

  it('enlarges the live QR in DropArtOverlay like cover', () => {
    expect(sheet).toContain('ticket-show-pass-qr--zoom');
    expect(sheet).toContain('setQrEnlargeOpen(true)');
    expect(sheet).toContain('ticket-show-pass-qr-zoom');
    expect(sheet).toContain('Enlarge pass code');
    expect(css).toContain('button.ticket-show-pass-qr--zoom');
    expect(css).toContain('.ticket-show-pass-qr-zoom');
  });

  it('keeps the prop title over late status metadata', () => {
    expect(sheet).toContain(
      "(title.trim() || status?.title?.trim() || 'Pass')"
    );
    expect(sheet).not.toContain('(status?.title ?? title)');
  });

  it('copies with a green tick and shares with ShareIcon', () => {
    expect(sheet).toContain('CheckIcon');
    expect(sheet).toContain('ShareIcon');
    expect(sheet).toContain('ticket-show-pass-code-tick');
    expect(sheet).toContain('sharePicture');
    expect(sheet).not.toContain("codeCopied ? 'Copied'");
    expect(sheet).not.toContain("Saving…");
    expect(sheet).not.toContain('Downloading…');
    expect(sheet).not.toContain('PortfolioLocationMark');
    expect(sheet).not.toContain('Place · {placeLabel}');
    expect(css).toContain('justify-content: flex-start');
    expect(css).toContain('ticket-show-pass-mark-seat');
    expect(css).toContain('100svh - 24.5rem');
    expect(css).toMatch(
      /\.mage-stroke-icon\.ticket-show-pass-code-tick\s*\{[\s\S]*?protocol-green/
    );
  });
});
