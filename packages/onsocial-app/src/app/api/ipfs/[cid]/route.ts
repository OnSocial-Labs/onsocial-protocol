import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { isLikelyIpfsCid } from '@/features/scarces/drop-writing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CDN_BASE =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://cdn.onsocial.id/ipfs'
    : 'https://cdn.testnet.onsocial.id/ipfs';

/**
 * Same-origin IPFS proxy — streams upstream so download progress is real.
 * `?download=1&filename=` sets Content-Disposition for save-as.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ cid: string }> }
) {
  const { cid: raw } = await context.params;
  const cid = decodeURIComponent(raw ?? '')
    .trim()
    .replace(/^ipfs:\/\//, '');
  const root = cid.split('/')[0] ?? '';
  if (!root || !isLikelyIpfsCid(root)) {
    return NextResponse.json({ error: 'Invalid CID' }, { status: 400 });
  }

  const upstream = await fetch(`${CDN_BASE}/${cid}`, {
    headers: { Accept: '*/*' },
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: 'Content not found' },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const contentType =
    upstream.headers.get('content-type') || 'application/octet-stream';
  const contentLength = upstream.headers.get('content-length');
  const wantDownload =
    request.nextUrl.searchParams.get('download') === '1' ||
    request.nextUrl.searchParams.get('download') === 'true';
  const rawName = request.nextUrl.searchParams.get('filename')?.trim() || '';
  const safeName = rawName
    .replace(/["\r\n\\/]/g, '')
    .replace(/[^\w\s.-]+/g, '')
    .trim()
    .slice(0, 120);
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400, immutable',
  });
  if (contentLength) headers.set('Content-Length', contentLength);
  if (wantDownload) {
    const filename = safeName || 'download';
    headers.set(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
