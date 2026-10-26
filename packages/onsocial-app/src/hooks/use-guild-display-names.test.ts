import { describe, expect, it, vi } from 'vitest';
import {
  seedGuildDisplayNames,
  seedGuildDisplayNamesFromFeed,
  subscribeGuildDisplayNames,
} from './use-guild-display-names';

describe('guild display name seeding', () => {
  it('notifies once per changed batch, never for no-op reseeds', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGuildDisplayNames(listener);

    seedGuildDisplayNames(
      { 'guild-one.testnet': 'Guild One', 'guild-two.testnet': 'Guild Two' },
      { notify: true }
    );
    expect(listener).toHaveBeenCalledTimes(1);

    seedGuildDisplayNames(
      { 'guild-one.testnet': 'Guild One' },
      { notify: true }
    );
    expect(listener).toHaveBeenCalledTimes(1);

    seedGuildDisplayNames({ 'guild-one.testnet': 'Guild Uno' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    seedGuildDisplayNames(
      { 'guild-one.testnet': 'Guild One Again' },
      { notify: true }
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('threads notify through feed seeding', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGuildDisplayNames(listener);

    seedGuildDisplayNamesFromFeed(
      [
        { groupId: 'guild-three.testnet', groupName: 'Guild Three' },
        { groupId: 'guild-three.testnet', groupName: 'Guild Three' },
        { groupId: ' ', groupName: 'Skipped' },
      ],
      { notify: true }
    );
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
