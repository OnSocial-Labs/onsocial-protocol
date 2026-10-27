import { describe, expect, it } from 'vitest';
import { endorsementStageMedia } from '@/lib/endorsement-media';

describe('endorsementStageMedia', () => {
  it('forwards persisted width/height hints to the stage tile', () => {
    const stage = endorsementStageMedia({
      media: { cid: 'bafyproof', mime: 'image/jpeg', width: 1600, height: 900 },
    });
    expect(stage).toMatchObject({
      mime: 'image/jpeg',
      cid: 'bafyproof',
      width: 1600,
      height: 900,
    });
  });

  it('omits hints when missing or non-positive', () => {
    const stage = endorsementStageMedia({
      media: { cid: 'bafyproof', mime: 'image/jpeg', width: 0 },
    });
    expect(stage?.width).toBeUndefined();
    expect(stage?.height).toBeUndefined();
  });
});
