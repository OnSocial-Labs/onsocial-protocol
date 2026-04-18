import { describe, expect, it } from 'vitest';
import {
  mapAppNotificationEventNotifications,
  mapDataUpdateNotifications,
  mapGroupInviteNotification,
  mapGroupProposalNotifications,
  mapRewardsEventNotifications,
  mapScarcesEventNotifications,
} from '../../src/services/notifications/worker.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDataUpdate(
  overrides: Partial<Parameters<typeof mapDataUpdateNotifications>[0]> = {}
): Parameters<typeof mapDataUpdateNotifications>[0] {
  return {
    id: 'du-default',
    block_height: 100,
    block_timestamp: '1730000000000000000',
    receipt_id: 'rcpt-default',
    operation: 'set',
    author: 'alice.testnet',
    path: 'alice/post/main',
    value: '{"type":"md"}',
    account_id: 'alice.testnet',
    data_type: 'post',
    data_id: 'main',
    group_id: null,
    target_account: null,
    parent_path: null,
    parent_author: null,
    ref_path: null,
    ref_author: null,
    ...overrides,
  };
}

function makeScarcesEvent(
  overrides: Partial<Parameters<typeof mapScarcesEventNotifications>[0]> = {}
): Parameters<typeof mapScarcesEventNotifications>[0] {
  return {
    id: 'sc-default',
    block_height: 400,
    block_timestamp: '1730000007000000000',
    receipt_id: 'rcpt-default',
    event_type: 'SCARCE_UPDATE',
    operation: 'purchase',
    author: 'market.testnet',
    token_id: 'scarce-1',
    collection_id: 'collection-1',
    listing_id: 'listing-1',
    owner_id: 'seller.testnet',
    creator_id: 'creator.testnet',
    buyer_id: 'buyer.testnet',
    seller_id: 'seller.testnet',
    bidder: null,
    winner_id: null,
    account_id: null,
    amount: '500',
    price: '500',
    bid_amount: null,
    app_id: 'portal',
    scarce_contract_id: 'scarces.onsocial.testnet',
    ...overrides,
  };
}

describe('mapDataUpdateNotifications', () => {
  it('maps replies and quotes from post writes', () => {
    const notifications = mapDataUpdateNotifications({
      id: 'du-1',
      block_height: 101,
      block_timestamp: '1730000000000000000',
      receipt_id: 'rcpt-1',
      operation: 'set',
      author: 'alice.testnet',
      path: 'alice/post/main',
      value: '{"type":"md"}',
      account_id: 'alice.testnet',
      data_type: 'post',
      data_id: 'main',
      group_id: null,
      target_account: null,
      parent_path: 'bob/post/root',
      parent_author: 'bob.testnet',
      ref_path: 'carol/post/root',
      ref_author: 'carol.testnet',
    });

    expect(notifications).toHaveLength(2);
    expect(
      notifications.map((notification) => notification.notificationType)
    ).toEqual(['reply', 'quote']);
    expect(notifications.map((notification) => notification.recipient)).toEqual(
      ['bob.testnet', 'carol.testnet']
    );
  });

  it('maps reactions and standings to the target account', () => {
    const reactionNotifications = mapDataUpdateNotifications({
      id: 'du-2',
      block_height: 102,
      block_timestamp: '1730000001000000000',
      receipt_id: 'rcpt-2',
      operation: 'set',
      author: 'alice.testnet',
      path: 'alice/reaction/bob.testnet/post/42',
      value: 'like',
      account_id: 'alice.testnet',
      data_type: 'reaction',
      data_id: null,
      group_id: null,
      target_account: 'bob.testnet',
      parent_path: null,
      parent_author: null,
      ref_path: null,
      ref_author: null,
    });

    const standingNotifications = mapDataUpdateNotifications({
      id: 'du-3',
      block_height: 103,
      block_timestamp: '1730000002000000000',
      receipt_id: 'rcpt-3',
      operation: 'set',
      author: 'alice.testnet',
      path: 'alice/standing/bob.testnet',
      value: '{"standing":"support"}',
      account_id: 'alice.testnet',
      data_type: 'standing',
      data_id: null,
      group_id: null,
      target_account: 'bob.testnet',
      parent_path: null,
      parent_author: null,
      ref_path: null,
      ref_author: null,
    });

    expect(reactionNotifications).toHaveLength(1);
    expect(reactionNotifications[0]?.notificationType).toBe('reaction');
    expect(reactionNotifications[0]?.recipient).toBe('bob.testnet');
    expect(standingNotifications).toHaveLength(1);
    expect(standingNotifications[0]?.notificationType).toBe('standing_new');
  });
});

describe('group notifications', () => {
  it('maps direct invites', () => {
    const notifications = mapGroupInviteNotification({
      id: 'gu-1',
      block_height: 200,
      block_timestamp: '1730000003000000000',
      receipt_id: 'rcpt-4',
      operation: 'member_invited',
      author: 'owner.testnet',
      group_id: 'guild',
      member_id: 'newmember.testnet',
      role: 'member',
      proposal_id: null,
      proposal_type: null,
      status: null,
      title: null,
      description: null,
      sequence_number: null,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.notificationType).toBe('group_invite');
    expect(notifications[0]?.recipient).toBe('newmember.testnet');
  });

  it('fans out proposal notifications to current members', () => {
    const notifications = mapGroupProposalNotifications(
      {
        id: 'gu-2',
        block_height: 201,
        block_timestamp: '1730000004000000000',
        receipt_id: 'rcpt-5',
        operation: 'proposal_created',
        author: 'owner.testnet',
        group_id: 'guild',
        member_id: null,
        role: null,
        proposal_id: 'proposal-1',
        proposal_type: 'custom_proposal',
        status: 'open',
        title: 'Add reward lane',
        description: 'Proposal body',
        sequence_number: 12,
      },
      ['owner.testnet', 'member1.testnet', 'member2.testnet']
    );

    expect(notifications).toHaveLength(2);
    expect(
      notifications.every(
        (notification) => notification.notificationType === 'group_proposal'
      )
    ).toBe(true);
    expect(notifications.map((notification) => notification.recipient)).toEqual(
      ['member1.testnet', 'member2.testnet']
    );
  });
});

describe('mapRewardsEventNotifications', () => {
  it('maps reward credits and claims', () => {
    const credited = mapRewardsEventNotifications({
      id: 'rw-1',
      block_height: 300,
      block_timestamp: '1730000005000000000',
      receipt_id: 'rcpt-6',
      account_id: 'alice.testnet',
      event_type: 'REWARD_CREDITED',
      success: true,
      amount: '2500000000000000000',
      source: 'content_reward',
      credited_by: 'rewards.onsocial.testnet',
      app_id: 'portal',
    });

    const claimed = mapRewardsEventNotifications({
      id: 'rw-2',
      block_height: 301,
      block_timestamp: '1730000006000000000',
      receipt_id: 'rcpt-7',
      account_id: 'alice.testnet',
      event_type: 'REWARD_CLAIMED',
      success: true,
      amount: '1000000000000000000',
      source: null,
      credited_by: null,
      app_id: 'portal',
    });

    expect(credited).toHaveLength(1);
    expect(credited[0]?.notificationType).toBe('reward_credited');
    expect(credited[0]?.appId).toBe('portal');
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.notificationType).toBe('reward_claimed');
    expect(claimed[0]?.actor).toBe('alice.testnet');
  });
});

describe('mapScarcesEventNotifications', () => {
  it('maps sale and offer events', () => {
    const sold = mapScarcesEventNotifications({
      id: 'sc-1',
      block_height: 400,
      block_timestamp: '1730000007000000000',
      receipt_id: 'rcpt-8',
      event_type: 'SCARCE_UPDATE',
      operation: 'purchase',
      author: 'market.testnet',
      token_id: 'scarce-1',
      collection_id: 'collection-1',
      listing_id: 'listing-1',
      owner_id: 'seller.testnet',
      creator_id: 'creator.testnet',
      buyer_id: 'buyer.testnet',
      seller_id: 'seller.testnet',
      bidder: null,
      winner_id: null,
      account_id: null,
      amount: '500',
      price: '500',
      bid_amount: null,
      app_id: 'portal',
      scarce_contract_id: 'scarces.onsocial.testnet',
    });

    const offer = mapScarcesEventNotifications({
      id: 'sc-2',
      block_height: 401,
      block_timestamp: '1730000008000000000',
      receipt_id: 'rcpt-9',
      event_type: 'OFFER_UPDATE',
      operation: 'offer_make',
      author: 'buyer.testnet',
      token_id: 'scarce-1',
      collection_id: 'collection-1',
      listing_id: 'listing-1',
      owner_id: 'seller.testnet',
      creator_id: 'creator.testnet',
      buyer_id: null,
      seller_id: 'seller.testnet',
      bidder: 'buyer.testnet',
      winner_id: null,
      account_id: 'buyer.testnet',
      amount: '450',
      price: '450',
      bid_amount: '450',
      app_id: 'portal',
      scarce_contract_id: 'scarces.onsocial.testnet',
    });

    expect(sold).toHaveLength(1);
    expect(sold[0]?.notificationType).toBe('scarces_sold');
    expect(sold[0]?.recipient).toBe('seller.testnet');
    expect(offer).toHaveLength(1);
    expect(offer[0]?.notificationType).toBe('scarces_offer');
    expect(offer[0]?.actor).toBe('buyer.testnet');
  });
});

describe('mapAppNotificationEventNotifications', () => {
  it('maps queued custom app events into managed notifications', () => {
    const notifications = mapAppNotificationEventNotifications({
      id: 'app-evt-1',
      block_height: 1,
      created_at: '2026-04-13T12:00:00.000Z',
      owner_account_id: 'alice.testnet',
      app_id: 'portal',
      recipient: 'bob.testnet',
      actor: 'system',
      event_type: 'comment.reply',
      dedupe_key: 'reply:post-1:bob',
      object_id: 'post-1',
      group_id: 'writers',
      source_contract: 'app',
      source_receipt_id: 'rcpt-1',
      source_block_height: 500,
      context: { title: 'New reply', unreadReason: 'followed-thread' },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.notificationType).toBe('app_event');
    expect(notifications[0]?.ownerAccountId).toBe('alice.testnet');
    expect(notifications[0]?.appId).toBe('portal');
    expect(notifications[0]?.recipient).toBe('bob.testnet');
    expect(notifications[0]?.context).toEqual({
      title: 'New reply',
      unreadReason: 'followed-thread',
      eventType: 'comment.reply',
      objectId: 'post-1',
      groupId: 'writers',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases & correctness
// ═══════════════════════════════════════════════════════════════════════════

describe('self-notification suppression', () => {
  it('suppresses reply notification when author replies to own post', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        author: 'alice.testnet',
        parent_author: 'alice.testnet',
        parent_path: 'alice/post/root',
        ref_author: null,
        ref_path: null,
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('suppresses reaction notification when user reacts to own post', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        data_type: 'reaction',
        author: 'alice.testnet',
        target_account: 'alice.testnet',
        path: 'alice/reaction/alice.testnet/post/42',
        value: 'like',
        parent_path: null,
        parent_author: null,
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('suppresses standing notification when user somehow stands with self', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        data_type: 'standing',
        author: 'alice.testnet',
        target_account: 'alice.testnet',
        path: 'alice/standing/alice.testnet',
        parent_path: null,
        parent_author: null,
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('suppresses scarces_sold when buyer is also seller', () => {
    const notifications = mapScarcesEventNotifications(
      makeScarcesEvent({
        seller_id: 'alice.testnet',
        buyer_id: 'alice.testnet',
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('suppresses scarces_offer when bidder is also owner', () => {
    const notifications = mapScarcesEventNotifications(
      makeScarcesEvent({
        operation: 'offer_make',
        event_type: 'OFFER_UPDATE',
        owner_id: 'alice.testnet',
        bidder: 'alice.testnet',
      })
    );
    expect(notifications).toHaveLength(0);
  });
});

describe('operation filtering', () => {
  it('ignores delete operations on data_updates (standing removal, etc.)', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        operation: 'delete',
        data_type: 'standing',
        target_account: 'bob.testnet',
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('ignores non-set operations (update, etc.)', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({ operation: 'update' })
    );
    expect(notifications).toHaveLength(0);
  });

  it('ignores null operations', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({ operation: null })
    );
    expect(notifications).toHaveLength(0);
  });

  it('only maps member_invited for group invites', () => {
    expect(
      mapGroupInviteNotification({
        id: 'gu-x',
        block_height: 200,
        block_timestamp: '1730000003000000000',
        receipt_id: 'rcpt-x',
        operation: 'add_member',
        author: 'owner.testnet',
        group_id: 'guild',
        member_id: 'new.testnet',
        role: 'member',
        proposal_id: null,
        proposal_type: null,
        status: null,
        title: null,
        description: null,
        sequence_number: null,
      })
    ).toHaveLength(0);
  });

  it('ignores failed reward events', () => {
    const notifications = mapRewardsEventNotifications({
      id: 'rw-fail',
      block_height: 300,
      block_timestamp: '1730000005000000000',
      receipt_id: 'rcpt-fail',
      account_id: 'alice.testnet',
      event_type: 'REWARD_CREDITED',
      success: false,
      amount: '100',
      source: 'content_reward',
      credited_by: 'rewards.onsocial.testnet',
      app_id: 'portal',
    });
    expect(notifications).toHaveLength(0);
  });

  it('ignores unknown scarces operations', () => {
    const notifications = mapScarcesEventNotifications(
      makeScarcesEvent({ operation: 'quick_mint' })
    );
    expect(notifications).toHaveLength(0);
  });
});

describe('malformed/null field handling', () => {
  it('returns empty when author is null', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        author: null,
        account_id: null,
        parent_author: 'bob.testnet',
        parent_path: 'bob/post/root',
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('returns empty when recipient fields are null/empty', () => {
    // Post with no parent and no ref → no reply, no quote
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        parent_author: null,
        parent_path: null,
        ref_author: null,
        ref_path: null,
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('returns empty for reaction with no target_account', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        data_type: 'reaction',
        target_account: null,
        path: 'alice/reaction/bob.testnet/post/42',
        value: 'like',
        parent_path: null,
        parent_author: null,
      })
    );
    expect(notifications).toHaveLength(0);
  });

  it('returns empty for app event with missing required fields', () => {
    const noRecipient = mapAppNotificationEventNotifications({
      id: 'app-bad',
      block_height: 1,
      created_at: '2026-01-01T00:00:00Z',
      owner_account_id: 'alice.testnet',
      app_id: 'portal',
      recipient: '',
      actor: 'bob.testnet',
      event_type: 'custom',
      dedupe_key: 'test',
      object_id: null,
      group_id: null,
      source_contract: 'app',
      source_receipt_id: null,
      source_block_height: null,
      context: {},
    });
    expect(noRecipient).toHaveLength(0);
  });
});

describe('dedup key correctness', () => {
  it('generates unique dedup keys per row+type+recipient', () => {
    const n1 = mapDataUpdateNotifications(
      makeDataUpdate({
        id: 'row-A',
        data_type: 'standing',
        target_account: 'bob.testnet',
      })
    );
    const n2 = mapDataUpdateNotifications(
      makeDataUpdate({
        id: 'row-B',
        data_type: 'standing',
        target_account: 'bob.testnet',
      })
    );
    expect(n1).toHaveLength(1);
    expect(n2).toHaveLength(1);
    expect(n1[0]?.dedupeKey).not.toBe(n2[0]?.dedupeKey);
  });

  it('same row processed twice produces same dedup key', () => {
    const input = makeDataUpdate({
      id: 'row-C',
      data_type: 'standing',
      target_account: 'bob.testnet',
    });
    const n1 = mapDataUpdateNotifications(input);
    const n2 = mapDataUpdateNotifications(input);
    expect(n1[0]?.dedupeKey).toBe(n2[0]?.dedupeKey);
  });

  it('reply and quote from same row have different dedup keys', () => {
    const notifications = mapDataUpdateNotifications(
      makeDataUpdate({
        parent_author: 'bob.testnet',
        parent_path: 'bob/post/root',
        ref_author: 'carol.testnet',
        ref_path: 'carol/post/root',
      })
    );
    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.dedupeKey).not.toBe(notifications[1]?.dedupeKey);
  });
});

describe('group proposal fan-out', () => {
  it('excludes the proposal author from recipients', () => {
    const notifications = mapGroupProposalNotifications(
      {
        id: 'gu-fan',
        block_height: 201,
        block_timestamp: '1730000004000000000',
        receipt_id: 'rcpt-fan',
        operation: 'proposal_created',
        author: 'owner.testnet',
        group_id: 'guild',
        member_id: null,
        role: null,
        proposal_id: 'p-1',
        proposal_type: 'add_member',
        status: 'open',
        title: 'Add Alice',
        description: null,
        sequence_number: 1,
      },
      ['owner.testnet', 'member1.testnet', 'member2.testnet']
    );
    // owner.testnet is the author → should be excluded (self-notification)
    const recipients = notifications.map((n) => n.recipient);
    expect(recipients).not.toContain('owner.testnet');
    expect(recipients).toEqual(['member1.testnet', 'member2.testnet']);
  });
});
