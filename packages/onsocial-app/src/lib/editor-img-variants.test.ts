import { describe, expect, it } from 'vitest';
import { ipfsImgSrcSet } from '@onsocial/ui';
import {
  APP_COLUMN_HERO_SIZES,
  EDITOR_MARK_SIZES,
  EDITOR_MARK_WIDTHS,
  ENDORSE_MEDIA_SIZES,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';

const CID = 'bafkreibxdtzgz3bkffs25wnci6ftdvdmtpt5b42o4kxft6rvyod5il34ii';
const CDN_URL = `https://cdn.testnet.onsocial.id/ipfs/${CID}`;

/**
 * g10 editor previews — look previews, edit banners, endorse existing
 * media. Existing CDN IPFS art gets the variant ladder; fresh file picks
 * (blob/data) and non-CDN sources must render exactly as before.
 */
describe('editor img variants', () => {
  it('wide editor banners ride the 384/1080 hero ladder', () => {
    const srcSet = ipfsImgSrcSet(CDN_URL, SCARCE_HERO_WIDTHS);
    expect(srcSet).toBe(
      `https://cdn.testnet.onsocial.id/img/384/ipfs/${CID} 384w, ` +
        `https://cdn.testnet.onsocial.id/img/1080/ipfs/${CID} 1080w`
    );
    expect(APP_COLUMN_HERO_SIZES).toBe('(min-width: 640px) 608px, 100vw');
  });

  it('square editor marks ride the 128/384 ladder at the shared slot size', () => {
    const srcSet = ipfsImgSrcSet(CDN_URL, EDITOR_MARK_WIDTHS);
    expect(srcSet).toBe(
      `https://cdn.testnet.onsocial.id/img/128/ipfs/${CID} 128w, ` +
        `https://cdn.testnet.onsocial.id/img/384/ipfs/${CID} 384w`
    );
    expect(EDITOR_MARK_SIZES).toBe('84px');
  });

  it('endorse media keeps the height-capped slot size honest', () => {
    expect(ENDORSE_MEDIA_SIZES).toBe('(min-width: 640px) 384px, 70vw');
  });

  it('mainnet CDN originals variant on the mainnet host', () => {
    const srcSet = ipfsImgSrcSet(
      `https://cdn.onsocial.id/ipfs/${CID}`,
      EDITOR_MARK_WIDTHS
    );
    expect(srcSet).toContain(`https://cdn.onsocial.id/img/128/ipfs/${CID}`);
  });

  it('fresh picks (blob/data URLs) get no srcSet — render as before', () => {
    expect(
      ipfsImgSrcSet('blob:https://app.onsocial.id/uuid', SCARCE_HERO_WIDTHS)
    ).toBeUndefined();
    expect(
      ipfsImgSrcSet('data:image/png;base64,AAAA', EDITOR_MARK_WIDTHS)
    ).toBeUndefined();
  });

  it('external hosts and CDN subpaths stay on the original URL', () => {
    expect(
      ipfsImgSrcSet('https://example.com/art.png', SCARCE_HERO_WIDTHS)
    ).toBeUndefined();
    // Seat-art subpaths are the g9 boundary — the CDN route cannot resize them.
    expect(
      ipfsImgSrcSet(`${CDN_URL}/seat-3.png`, SCARCE_HERO_WIDTHS)
    ).toBeUndefined();
  });

  it('gif/svg pass through byte-identical via the mime gate', () => {
    expect(
      ipfsImgSrcSet(CDN_URL, SCARCE_HERO_WIDTHS, 'image/gif')
    ).toBeUndefined();
    expect(
      ipfsImgSrcSet(CDN_URL, EDITOR_MARK_WIDTHS, 'image/svg+xml')
    ).toBeUndefined();
    expect(
      ipfsImgSrcSet(CDN_URL, SCARCE_HERO_WIDTHS, 'image/png')
    ).toBeDefined();
  });
});
