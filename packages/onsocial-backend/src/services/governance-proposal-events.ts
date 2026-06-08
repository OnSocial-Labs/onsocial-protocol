import { EventEmitter } from 'events';

export type DaoProposalUpdatedEvent = {
  daoAccountId: string;
  proposalId: number;
};

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

export function publishDaoProposalUpdated(
  event: DaoProposalUpdatedEvent
): void {
  emitter.emit('proposal-updated', event);
}

export function subscribeDaoProposalUpdates(
  listener: (event: DaoProposalUpdatedEvent) => void
): () => void {
  emitter.on('proposal-updated', listener);
  return () => {
    emitter.off('proposal-updated', listener);
  };
}
