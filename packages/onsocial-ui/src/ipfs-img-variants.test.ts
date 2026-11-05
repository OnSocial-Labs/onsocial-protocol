import { describe, expect, it } from 'vitest';
import {
  IPFS_IMG_RETRY_DELAY_MS,
  IPFS_IMG_VARIANT_WIDTHS,
  ipfsImgLoadState,
  ipfsImgOriginalUrl,
  ipfsImgSrcSet,
  ipfsImgVariantUrl,
  isCdnIpfsImgUrl,
  nextIpfsImgLoadOnError,
  type IpfsImgLoadState,
} from './ipfs-img-variants.js';

const MAINNET_CID =
  'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const TESTNET_URL = `https://cdn.testnet.onsocial.id/ipfs/${MAINNET_CID}`;
const MAINNET_URL = `https://cdn.onsocial.id/ipfs/${MAINNET_CID}`;

describe('ipfsImgVariantUrl', () => {
  it('builds a variant URL on the same host for every locked width', () => {
    for (const width of IPFS_IMG_VARIANT_WIDTHS) {
      expect(ipfsImgVariantUrl(MAINNET_URL, width)).toBe(
        `https://cdn.onsocial.id/img/${width}/ipfs/${MAINNET_CID}`
      );
    }
  });

  it('keeps the testnet host', () => {
    expect(ipfsImgVariantUrl(TESTNET_URL, 384)).toBe(
      `https://cdn.testnet.onsocial.id/img/384/ipfs/${MAINNET_CID}`
    );
  });

  it('accepts base58 CIDv0 roots', () => {
    const v0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
    expect(ipfsImgVariantUrl(`https://cdn.onsocial.id/ipfs/${v0}`, 128)).toBe(
      `https://cdn.onsocial.id/img/128/ipfs/${v0}`
    );
  });

  it('carries variation seat art through the variant URL (g9)', () => {
    for (const seat of ['1.png', '42.jpeg', '7.webp', '3.PNG'] as const) {
      expect(ipfsImgVariantUrl(`${TESTNET_URL}/${seat}`, 384)).toBe(
        `https://cdn.testnet.onsocial.id/img/384/ipfs/${MAINNET_CID}/${seat}`
      );
    }
  });

  it('rejects URLs the CDN route would not match', () => {
    const cases = [
      // Non-seat subpaths — the route only allows numeric stems + image ext.
      `${MAINNET_URL}/photo.png`,
      `${MAINNET_URL}/1.json`,
      `${MAINNET_URL}/1.png/extra`,
      `${MAINNET_URL}/../1.png`,
      // Query strings.
      `${MAINNET_URL}?download=1`,
      // Other gateways / hosts.
      `https://ipfs.io/ipfs/${MAINNET_CID}`,
      `https://example.com/ipfs/${MAINNET_CID}`,
      // Lookalike hosts that must not be rewritten.
      `https://cdn.evil.onsocial.id/ipfs/${MAINNET_CID}`,
      `https://cdn.onsocial.id.evil.com/ipfs/${MAINNET_CID}`,
      // Local previews and relative URLs.
      'blob:https://app.onsocial.id/1234',
      `/api/ipfs/${MAINNET_CID}`,
      '',
      null,
      undefined,
    ];
    for (const input of cases) {
      expect(ipfsImgVariantUrl(input, 128)).toBeNull();
    }
  });

  it('trims surrounding whitespace', () => {
    expect(ipfsImgVariantUrl(`  ${MAINNET_URL}  `, 128)).toBe(
      `https://cdn.onsocial.id/img/128/ipfs/${MAINNET_CID}`
    );
  });

  it('bypasses gif and svg — imgproxy serves those byte-identical (D3)', () => {
    expect(ipfsImgVariantUrl(MAINNET_URL, 384, 'image/gif')).toBeNull();
    expect(ipfsImgVariantUrl(MAINNET_URL, 384, 'image/svg+xml')).toBeNull();
  });

  it('matches pass-through MIMEs case-insensitively', () => {
    expect(ipfsImgVariantUrl(MAINNET_URL, 384, ' Image/GIF ')).toBeNull();
  });

  it('still rewrites for resizable MIMEs and when MIME is unknown', () => {
    for (const mime of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ]) {
      expect(ipfsImgVariantUrl(MAINNET_URL, 384, mime)).toBe(
        `https://cdn.onsocial.id/img/384/ipfs/${MAINNET_CID}`
      );
    }
    expect(ipfsImgVariantUrl(MAINNET_URL, 384, null)).toBe(
      `https://cdn.onsocial.id/img/384/ipfs/${MAINNET_CID}`
    );
    expect(ipfsImgVariantUrl(MAINNET_URL, 384)).toBe(
      `https://cdn.onsocial.id/img/384/ipfs/${MAINNET_CID}`
    );
  });
});

describe('ipfsImgSrcSet', () => {
  it('emits every locked width as a width descriptor', () => {
    expect(ipfsImgSrcSet(MAINNET_URL)).toBe(
      [
        `https://cdn.onsocial.id/img/128/ipfs/${MAINNET_CID} 128w`,
        `https://cdn.onsocial.id/img/384/ipfs/${MAINNET_CID} 384w`,
        `https://cdn.onsocial.id/img/1080/ipfs/${MAINNET_CID} 1080w`,
        `https://cdn.onsocial.id/img/1920/ipfs/${MAINNET_CID} 1920w`,
      ].join(', ')
    );
  });

  it('honours a custom width subset', () => {
    expect(ipfsImgSrcSet(TESTNET_URL, [128, 384])).toBe(
      [
        `https://cdn.testnet.onsocial.id/img/128/ipfs/${MAINNET_CID} 128w`,
        `https://cdn.testnet.onsocial.id/img/384/ipfs/${MAINNET_CID} 384w`,
      ].join(', ')
    );
  });

  it('keeps the seat suffix on every rung of the srcSet (g9)', () => {
    expect(ipfsImgSrcSet(`${TESTNET_URL}/3.png`, [128, 384])).toBe(
      [
        `https://cdn.testnet.onsocial.id/img/128/ipfs/${MAINNET_CID}/3.png 128w`,
        `https://cdn.testnet.onsocial.id/img/384/ipfs/${MAINNET_CID}/3.png 384w`,
      ].join(', ')
    );
  });

  it('returns undefined for non-CDN URLs', () => {
    expect(ipfsImgSrcSet('blob:https://app.onsocial.id/1234')).toBeUndefined();
    expect(ipfsImgSrcSet(null)).toBeUndefined();
  });

  it('returns undefined for gif/svg MIMEs (D3 passthrough)', () => {
    expect(
      ipfsImgSrcSet(MAINNET_URL, [384, 1080], 'image/gif')
    ).toBeUndefined();
    expect(
      ipfsImgSrcSet(MAINNET_URL, [384, 1080], 'image/svg+xml')
    ).toBeUndefined();
    expect(ipfsImgSrcSet(MAINNET_URL, undefined, 'image/gif')).toBeUndefined();
  });

  it('keeps the full rung set for resizable MIMEs', () => {
    expect(ipfsImgSrcSet(MAINNET_URL, undefined, 'image/jpeg')).toContain(
      '1080w'
    );
  });
});

const VARIANT_384 = `https://cdn.onsocial.id/img/384/ipfs/${MAINNET_CID}`;
const SEAT_VARIANT = `https://cdn.testnet.onsocial.id/img/128/ipfs/${MAINNET_CID}/3.png`;
const SEAT_ORIGINAL = `https://cdn.testnet.onsocial.id/ipfs/${MAINNET_CID}/3.png`;

function settle(state: IpfsImgLoadState): IpfsImgLoadState {
  return { ...state, waitMs: 0 };
}

describe('ipfs image retry and fallback', () => {
  it('uses a short positive retry delay', () => {
    expect(IPFS_IMG_RETRY_DELAY_MS).toBeGreaterThan(0);
    expect(IPFS_IMG_RETRY_DELAY_MS).toBeLessThan(1000);
  });

  it('maps a variant URL back to the original, including seat art', () => {
    expect(ipfsImgOriginalUrl(VARIANT_384)).toBe(MAINNET_URL);
    expect(ipfsImgOriginalUrl(SEAT_VARIANT)).toBe(SEAT_ORIGINAL);
    expect(ipfsImgOriginalUrl(`  ${MAINNET_URL}  `)).toBe(MAINNET_URL);
    expect(ipfsImgOriginalUrl('https://example.com/a.png')).toBeNull();
    expect(ipfsImgOriginalUrl(null)).toBeNull();
  });

  it('retries the failed variant once, then falls back to the original', () => {
    const srcSet = ipfsImgSrcSet(MAINNET_URL, [384, 1080]);
    let state = ipfsImgLoadState(MAINNET_URL, srcSet);

    state = nextIpfsImgLoadOnError(state, VARIANT_384, MAINNET_URL);
    expect(state.phase).toBe('retry');
    expect(state.src).toBe(VARIANT_384);
    expect(state.srcSet).toBeUndefined();
    expect(state.waitMs).toBe(IPFS_IMG_RETRY_DELAY_MS);

    state = nextIpfsImgLoadOnError(settle(state), VARIANT_384, MAINNET_URL);
    expect(state.phase).toBe('fallback');
    expect(state.src).toBe(MAINNET_URL);
    expect(state.srcSet).toBeUndefined();
    expect(state.waitMs).toBe(0);

    state = nextIpfsImgLoadOnError(state, MAINNET_URL, MAINNET_URL);
    expect(state.phase).toBe('exhausted');
    expect(state.src).toBe(MAINNET_URL);
    expect(state.srcSet).toBeUndefined();

    const again = nextIpfsImgLoadOnError(state, VARIANT_384, MAINNET_URL);
    expect(again).toBe(state);
    expect(again.src).toBe(MAINNET_URL);
  });

  it('keeps the seat suffix when falling back', () => {
    let state = ipfsImgLoadState(
      SEAT_ORIGINAL,
      ipfsImgSrcSet(SEAT_ORIGINAL, [128, 384])
    );
    state = nextIpfsImgLoadOnError(state, SEAT_VARIANT, SEAT_ORIGINAL);
    state = nextIpfsImgLoadOnError(settle(state), SEAT_VARIANT, SEAT_ORIGINAL);
    expect(state).toMatchObject({
      phase: 'fallback',
      src: SEAT_ORIGINAL,
      srcSet: undefined,
    });
  });

  it('retries a variant used as src, then falls back to /ipfs', () => {
    let state = ipfsImgLoadState(VARIANT_384);
    state = nextIpfsImgLoadOnError(state, VARIANT_384, VARIANT_384);
    expect(state.phase).toBe('retry');
    expect(state.src).toBe(VARIANT_384);
    expect(state.waitMs).toBe(IPFS_IMG_RETRY_DELAY_MS);

    state = nextIpfsImgLoadOnError(settle(state), VARIANT_384, VARIANT_384);
    expect(state).toMatchObject({
      phase: 'fallback',
      src: MAINNET_URL,
      srcSet: undefined,
      waitMs: 0,
    });
  });

  it('retries once when the element does not report the variant URL', () => {
    const srcSet = ipfsImgSrcSet(MAINNET_URL, [1080, 1920]);
    let state = ipfsImgLoadState(MAINNET_URL, srcSet);

    state = nextIpfsImgLoadOnError(state, '', MAINNET_URL);
    expect(state.phase).toBe('retry');
    expect(state.src).toBe(MAINNET_URL);
    expect(state.srcSet).toBe(srcSet);
    expect(state.waitMs).toBe(IPFS_IMG_RETRY_DELAY_MS);

    state = nextIpfsImgLoadOnError(settle(state), MAINNET_URL, MAINNET_URL);
    expect(state).toMatchObject({
      phase: 'fallback',
      src: MAINNET_URL,
      srcSet: undefined,
    });

    const stopped = nextIpfsImgLoadOnError(state, MAINNET_URL, MAINNET_URL);
    expect(stopped.phase).toBe('exhausted');
    expect(nextIpfsImgLoadOnError(stopped, MAINNET_URL, MAINNET_URL)).toBe(
      stopped
    );
  });

  it('ignores errors while the retry delay is pending', () => {
    const state = nextIpfsImgLoadOnError(
      ipfsImgLoadState(MAINNET_URL, ipfsImgSrcSet(MAINNET_URL)),
      VARIANT_384,
      MAINNET_URL
    );
    expect(nextIpfsImgLoadOnError(state, VARIANT_384, MAINNET_URL)).toBe(state);
    expect(nextIpfsImgLoadOnError(state, '', MAINNET_URL)).toBe(state);
  });

  it('does not retry a non-variant image', () => {
    const src = 'https://example.com/photo.jpg';
    const state = ipfsImgLoadState(src);
    const next = nextIpfsImgLoadOnError(state, src, src);
    expect(next.phase).toBe('exhausted');
    expect(next.src).toBe(src);
    expect(next.waitMs).toBe(0);
    expect(nextIpfsImgLoadOnError(next, src, src)).toBe(next);
  });

  it('stops on the original when no variant was requested', () => {
    const state = ipfsImgLoadState(MAINNET_URL);
    const next = nextIpfsImgLoadOnError(state, MAINNET_URL, MAINNET_URL);
    expect(next.phase).toBe('exhausted');
    expect(next.src).toBe(MAINNET_URL);
    expect(next.waitMs).toBe(0);
  });
});

describe('isCdnIpfsImgUrl', () => {
  it('matches both network hosts', () => {
    expect(isCdnIpfsImgUrl(MAINNET_URL)).toBe(true);
    expect(isCdnIpfsImgUrl(TESTNET_URL)).toBe(true);
  });

  it('rejects other URLs', () => {
    expect(isCdnIpfsImgUrl('https://ipfs.io/ipfs/x')).toBe(false);
    expect(isCdnIpfsImgUrl(undefined)).toBe(false);
  });
});
