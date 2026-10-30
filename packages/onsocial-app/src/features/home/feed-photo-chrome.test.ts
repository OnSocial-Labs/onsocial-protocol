import { describe, expect, it } from 'vitest';
import { mediaFaceChromeQuiet } from '@/features/home/feed-photo-chrome';

const loud = {
  open: true,
  chromeVisible: true,
  scrubbing: false,
  captionExpanded: false,
  threadOpen: false,
};

describe('mediaFaceChromeQuiet', () => {
  it('tucks chrome on a still the same way a video does', () => {
    expect(mediaFaceChromeQuiet({ ...loud, chromeVisible: false })).toBe(true);
  });

  it('stays loud while the face is closed, scrubbing, captioned, or in a thread', () => {
    expect(
      mediaFaceChromeQuiet({ ...loud, open: false, chromeVisible: false })
    ).toBe(false);
    expect(mediaFaceChromeQuiet(loud)).toBe(false);
    expect(
      mediaFaceChromeQuiet({ ...loud, chromeVisible: false, scrubbing: true })
    ).toBe(false);
    expect(
      mediaFaceChromeQuiet({
        ...loud,
        chromeVisible: false,
        captionExpanded: true,
      })
    ).toBe(false);
    expect(
      mediaFaceChromeQuiet({ ...loud, chromeVisible: false, threadOpen: true })
    ).toBe(false);
  });
});
