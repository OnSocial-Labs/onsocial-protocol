import { describe, expect, it } from 'vitest';
import {
  MESSAGES_INBOX_SUBTITLE,
  MESSAGES_INBOX_TITLE,
  resolveMessagesScreenChrome,
} from './messages-screen-chrome';

const peer = {
  peerName: 'Ada',
  peerHandle: 'ada.near',
  peerAccountId: 'ada.near',
};

describe('resolveMessagesScreenChrome', () => {
  it('keeps inbox chrome on desktop even with a thread open', () => {
    expect(
      resolveMessagesScreenChrome({
        narrow: false,
        threadOpen: true,
        ...peer,
      })
    ).toEqual({
      title: MESSAGES_INBOX_TITLE,
      subtitle: MESSAGES_INBOX_SUBTITLE,
      closeThread: false,
    });
  });

  it('uses the peer as the screen title on a mobile thread', () => {
    expect(
      resolveMessagesScreenChrome({
        narrow: true,
        threadOpen: true,
        ...peer,
      })
    ).toEqual({
      title: 'Ada',
      subtitle: '@ada.near',
      titleHref: '/ada.near',
      closeThread: true,
    });
  });

  it('stays on inbox chrome when no thread is open', () => {
    expect(
      resolveMessagesScreenChrome({
        narrow: true,
        threadOpen: false,
        ...peer,
      })
    ).toEqual({
      title: MESSAGES_INBOX_TITLE,
      subtitle: MESSAGES_INBOX_SUBTITLE,
      closeThread: false,
    });
  });

  it('omits a redundant @handle when the name is the account', () => {
    expect(
      resolveMessagesScreenChrome({
        narrow: true,
        threadOpen: true,
        peerName: 'ada.near',
        peerHandle: 'ada.near',
        peerAccountId: 'ada.near',
      })
    ).toEqual({
      title: 'ada.near',
      subtitle: undefined,
      titleHref: '/ada.near',
      closeThread: true,
    });
  });
});
