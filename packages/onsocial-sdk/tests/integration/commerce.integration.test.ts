// ---------------------------------------------------------------------------
// Integration: Commerce — mintPost (post → scarce NFT)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, testId, ACCOUNT_ID } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('commerce', () => {
  let os: OnSocial;
  const postId = testId();

  beforeAll(async () => {
    os = await getClient();
    // Write a post first so we can mint it
    await os.social.post(
      {
        text: `Commerce test post ${postId} — will be minted as scarce`,
        hashtags: ['commercetest'],
      },
      postId,
    );
  });

  it('should mint a post as a scarce NFT', async () => {
    const result = await os.mintPost(ACCOUNT_ID, postId);
    expect(result.mint.txHash).toBeTruthy();
    expect(result.listing).toBeUndefined(); // no priceNear = no auto-list
  });

  it('should mint a post with royalty', async () => {
    const postId2 = testId();
    await os.social.post(
      { text: `Royalty commerce test ${postId2}` },
      postId2,
    );

    const result = await os.mintPost(ACCOUNT_ID, postId2, {
      royalty: { [ACCOUNT_ID]: 500 }, // 5%
    });
    expect(result.mint.txHash).toBeTruthy();
  });
});
