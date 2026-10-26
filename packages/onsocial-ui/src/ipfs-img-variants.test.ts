import { describe, expect, it } from 'vitest';
import {
  IPFS_IMG_VARIANT_WIDTHS,
  ipfsImgSrcSet,
  ipfsImgVariantUrl,
  isCdnIpfsImgUrl,
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

  it('rejects URLs the CDN route would not match', () => {
    const cases = [
      // Subpaths — the locked route is root CIDs only.
      `${MAINNET_URL}/photo.png`,
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

  it('returns undefined for non-CDN URLs', () => {
    expect(ipfsImgSrcSet('blob:https://app.onsocial.id/1234')).toBeUndefined();
    expect(ipfsImgSrcSet(null)).toBeUndefined();
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
