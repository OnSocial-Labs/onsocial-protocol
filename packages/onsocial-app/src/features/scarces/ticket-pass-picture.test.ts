import { describe, expect, it } from 'vitest';
import {
  ticketPassCanSavePicture,
  ticketPassOffersSavePicture,
  ticketPassPictureFilename,
  ticketPassPictureStatusLine,
  ticketPassQrMatrix,
} from '@/features/scarces/ticket-pass-picture';

describe('ticket-pass-picture', () => {
  it('names the saved picture from the event', () => {
    expect(ticketPassPictureFilename('Night Drive')).toBe(
      'night-drive-pass.png'
    );
    expect(ticketPassPictureFilename('  ')).toBe('onsocial-pass.png');
  });

  it('hides Save when the device cannot share a picture file', () => {
    expect(ticketPassCanSavePicture()).toBe(false);
    expect(ticketPassOffersSavePicture()).toBe(false);
  });

  it('keeps a real status and drops the filler word Pass', () => {
    expect(ticketPassPictureStatusLine('1 check-in left')).toBe(
      '1 check-in left'
    );
    expect(ticketPassPictureStatusLine('Pass')).toBe('');
    expect(ticketPassPictureStatusLine('  ')).toBe('');
  });

  it('draws a square QR matrix for a saved pass code', () => {
    const matrix = ticketPassQrMatrix(
      'os2|night-drive|night-drive:3|1700000000000|pk|nonce|sig'
    );
    expect(matrix.size).toBeGreaterThan(20);
    expect(matrix.data).toHaveLength(matrix.size);
    expect(matrix.data[0]).toHaveLength(matrix.size);
  });
});
