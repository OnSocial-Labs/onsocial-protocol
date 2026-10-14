/**
 * Saved Show-pass picture — cover, event, and a high-contrast QR.
 * Apple Wallet and Google Wallet need issuer certificates this app does
 * not hold, so "Add to Wallet" shares this picture into Photos, Files,
 * Drive, and AirDrop. The guest shows that picture with no signal.
 */

import { encode, type QrCodeGenerateResult } from 'uqr';

const PICTURE_WIDTH = 1080;
const PICTURE_BG = '#101010';
const PICTURE_FG = '#f7f7f5';
const PICTURE_MUTED = 'rgba(247, 247, 245, 0.62)';
const PICTURE_GREEN = '#00ec97';
const PICTURE_QR = '#111111';
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export interface TicketPassPictureInput {
  title: string;
  whenLabel?: string | null;
  placeLabel?: string | null;
  statusLabel: string;
  seatLabel: string;
  holderName?: string | null;
  holderAccount?: string | null;
  qrValue: string;
  coverUrl?: string | null;
  /** Valid passes use the protocol green. Everything else stays quiet. */
  valid?: boolean;
}

export function ticketPassPictureFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'onsocial'}-pass.png`;
}

export function ticketPassWalletLabel(
  userAgent: string
): 'Apple Wallet' | 'Google Wallet' | 'Add to Wallet' {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'Apple Wallet';
  if (/android/.test(ua)) return 'Google Wallet';
  return 'Add to Wallet';
}

export function ticketPassQrMatrix(value: string): QrCodeGenerateResult {
  return encode(value, { ecc: 'H', border: 2 });
}

export type TicketPassShareResult = 'shared' | 'dismissed' | 'unavailable';

function loadCover(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function wrapLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const last = lines[lines.length - 1];
  if (last && ctx.measureText(last).width > maxWidth) {
    let trimmed = last;
    while (
      trimmed.length > 1 &&
      ctx.measureText(`${trimmed}…`).width > maxWidth
    ) {
      trimmed = trimmed.slice(0, -1);
    }
    lines[lines.length - 1] = `${trimmed}…`;
  }
  return lines;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawQr(
  ctx: CanvasRenderingContext2D,
  matrix: QrCodeGenerateResult,
  x: number,
  y: number,
  size: number
) {
  const n = matrix.size;
  if (!n) return;
  const cell = size / n;
  ctx.fillStyle = PICTURE_QR;
  for (let row = 0; row < n; row += 1) {
    const line = matrix.data[row];
    if (!line) continue;
    for (let col = 0; col < n; col += 1) {
      if (!line[col]) continue;
      ctx.fillRect(x + col * cell, y + row * cell, cell + 0.4, cell + 0.4);
    }
  }
}

function paintTicketPass(
  ctx: CanvasRenderingContext2D,
  input: TicketPassPictureInput,
  cover: HTMLImageElement | null,
  matrix: QrCodeGenerateResult
): number {
  const pad = 72;
  const contentW = PICTURE_WIDTH - pad * 2;
  let y = 84;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  if (cover) {
    const coverH = 520;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, y, contentW, coverH, 36);
    ctx.clip();
    drawCover(ctx, cover, pad, y, contentW, coverH);
    ctx.restore();
    y += coverH + 44;
  }

  ctx.fillStyle = PICTURE_FG;
  ctx.font = `600 54px ${FONT}`;
  const titleLines = wrapLine(ctx, input.title.trim() || 'Pass', contentW, 2);
  for (const line of titleLines) {
    ctx.fillText(line, PICTURE_WIDTH / 2, y);
    y += 66;
  }

  const when = input.whenLabel?.trim() || '';
  const place = input.placeLabel?.trim() || '';
  if (when || place) {
    y += 8;
    ctx.fillStyle = PICTURE_MUTED;
    ctx.font = `500 30px ${FONT}`;
    for (const line of [when, place].filter(Boolean)) {
      const wrapped = wrapLine(ctx, line, contentW, 2);
      for (const part of wrapped) {
        ctx.fillText(part, PICTURE_WIDTH / 2, y);
        y += 40;
      }
    }
  }

  y += 18;
  ctx.fillStyle = input.valid ? PICTURE_GREEN : PICTURE_MUTED;
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(input.statusLabel.trim() || 'Pass', PICTURE_WIDTH / 2, y);
  y += 56;

  const plate = 760;
  const plateX = (PICTURE_WIDTH - plate) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(plateX, y, plate, plate, 40);
  ctx.fill();
  const qrPad = 40;
  drawQr(ctx, matrix, plateX + qrPad, y + qrPad, plate - qrPad * 2);
  y += plate + 48;

  const holder = input.holderName?.trim() || '';
  const account = input.holderAccount?.trim() || '';
  if (holder) {
    ctx.fillStyle = PICTURE_FG;
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(holder, PICTURE_WIDTH / 2, y);
    y += 50;
  }
  if (account) {
    ctx.fillStyle = holder ? PICTURE_MUTED : PICTURE_FG;
    ctx.font = holder ? `500 30px ${FONT}` : `600 40px ${FONT}`;
    ctx.fillText(account, PICTURE_WIDTH / 2, y);
    y += holder ? 42 : 50;
  }

  ctx.fillStyle = PICTURE_MUTED;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(input.seatLabel.trim() || 'Pass', PICTURE_WIDTH / 2, y);
  y += 72;

  ctx.fillStyle = 'rgba(247, 247, 245, 0.42)';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText('OnSocial', PICTURE_WIDTH / 2, y);
  return y + 36;
}

async function canvasBlob(
  input: TicketPassPictureInput,
  cover: HTMLImageElement | null
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const matrix = ticketPassQrMatrix(input.qrValue);
  const scratch = document.createElement('canvas');
  scratch.width = PICTURE_WIDTH;
  scratch.height = 2800;
  const scratchCtx = scratch.getContext('2d');
  if (!scratchCtx) return null;
  scratchCtx.fillStyle = PICTURE_BG;
  scratchCtx.fillRect(0, 0, scratch.width, scratch.height);
  const end = paintTicketPass(scratchCtx, input, cover, matrix);

  const canvas = document.createElement('canvas');
  canvas.width = PICTURE_WIDTH;
  canvas.height = Math.max(900, Math.ceil(end + 56));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = PICTURE_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    scratch,
    0,
    0,
    PICTURE_WIDTH,
    canvas.height,
    0,
    0,
    PICTURE_WIDTH,
    canvas.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function renderTicketPassPicture(
  input: TicketPassPictureInput
): Promise<Blob | null> {
  const qr = input.qrValue.trim();
  if (!qr) return null;
  const coverUrl = input.coverUrl?.trim() || '';
  const cover = coverUrl ? await loadCover(coverUrl) : null;
  try {
    const blob = await canvasBlob(input, cover);
    if (blob) return blob;
  } catch {
    /* tainted canvas when the cover host blocks export */
  }
  if (!cover) return null;
  try {
    return await canvasBlob(input, null);
  } catch {
    return null;
  }
}

export function downloadTicketPassPicture(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareTicketPassPicture(
  blob: Blob,
  filename: string,
  title: string
): Promise<TicketPassShareResult> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function'
  ) {
    return 'unavailable';
  }
  const file = new File([blob], filename, { type: 'image/png' });
  if (
    typeof navigator.canShare === 'function' &&
    !navigator.canShare({ files: [file] })
  ) {
    return 'unavailable';
  }
  try {
    await navigator.share({
      files: [file],
      title,
      text: title,
    });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'dismissed';
    }
    return 'unavailable';
  }
}
