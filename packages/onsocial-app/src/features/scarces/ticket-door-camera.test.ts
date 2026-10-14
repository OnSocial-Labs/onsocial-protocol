import { encode } from 'uqr';
import { describe, expect, it } from 'vitest';
import { qrTextFromRgba } from '@/features/scarces/ticket-door-camera';

function paintPassQr(value: string): { data: Uint8ClampedArray; size: number } {
  const qr = encode(value, { ecc: 'M', border: 4 });
  const scale = 8;
  const size = qr.size * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      const black = qr.data[y]?.[x] === true;
      const channel = black ? 17 : 255;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const index = ((y * scale + dy) * size + (x * scale + dx)) * 4;
          data[index] = channel;
          data[index + 1] = channel;
          data[index + 2] = channel;
          data[index + 3] = 255;
        }
      }
    }
  }
  return { data, size };
}

describe('door camera QR reader', () => {
  it('reads the same QR the guest holds up', () => {
    const payload = 'os2|gate-pass|gate-pass:1|1|pk|nonce|sig';
    const { data, size } = paintPassQr(payload);
    expect(qrTextFromRgba(data, size, size)).toBe(payload);
  });

  it('returns nothing for an empty frame', () => {
    const size = 32;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    expect(qrTextFromRgba(data, size, size)).toBeNull();
  });
});
