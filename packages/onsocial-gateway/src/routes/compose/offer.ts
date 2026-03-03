/**
 * Compose routes: Offers — token-level and collection-level offers.
 */

import { Router } from 'express';
import { actionHandlers } from './helpers.js';
import {
  buildMakeOfferAction,
  buildCancelOfferAction,
  buildAcceptOfferAction,
  buildMakeCollectionOfferAction,
  buildCancelCollectionOfferAction,
  buildAcceptCollectionOfferAction,
} from '../../services/compose/offer.js';

export const offerRouter = Router();

// ── Make Offer ──────────────────────────────────────────────────────────────
const makeOffer = actionHandlers(
  (b) =>
    buildMakeOfferAction({
      tokenId: String(b.tokenId || ''),
      amountNear: String(b.amountNear || ''),
      expiresAt: b.expiresAt != null ? Number(b.expiresAt) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'make-offer'
);
offerRouter.post('/make-offer', makeOffer.relay);
offerRouter.post('/prepare/make-offer', makeOffer.prepare);

// ── Cancel Offer ────────────────────────────────────────────────────────────
const cancelOffer = actionHandlers(
  (b) =>
    buildCancelOfferAction({
      tokenId: String(b.tokenId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'cancel-offer'
);
offerRouter.post('/cancel-offer', cancelOffer.relay);
offerRouter.post('/prepare/cancel-offer', cancelOffer.prepare);

// ── Accept Offer ────────────────────────────────────────────────────────────
const acceptOffer = actionHandlers(
  (b) =>
    buildAcceptOfferAction({
      tokenId: String(b.tokenId || ''),
      buyerId: String(b.buyerId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'accept-offer'
);
offerRouter.post('/accept-offer', acceptOffer.relay);
offerRouter.post('/prepare/accept-offer', acceptOffer.prepare);

// ── Make Collection Offer ───────────────────────────────────────────────────
const makeColOffer = actionHandlers(
  (b) =>
    buildMakeCollectionOfferAction({
      collectionId: String(b.collectionId || ''),
      amountNear: String(b.amountNear || ''),
      expiresAt: b.expiresAt != null ? Number(b.expiresAt) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'make-collection-offer'
);
offerRouter.post('/make-collection-offer', makeColOffer.relay);
offerRouter.post('/prepare/make-collection-offer', makeColOffer.prepare);

// ── Cancel Collection Offer ─────────────────────────────────────────────────
const cancelColOffer = actionHandlers(
  (b) =>
    buildCancelCollectionOfferAction({
      collectionId: String(b.collectionId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'cancel-collection-offer'
);
offerRouter.post('/cancel-collection-offer', cancelColOffer.relay);
offerRouter.post('/prepare/cancel-collection-offer', cancelColOffer.prepare);

// ── Accept Collection Offer ─────────────────────────────────────────────────
const acceptColOffer = actionHandlers(
  (b) =>
    buildAcceptCollectionOfferAction({
      collectionId: String(b.collectionId || ''),
      tokenId: String(b.tokenId || ''),
      buyerId: String(b.buyerId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'accept-collection-offer'
);
offerRouter.post('/accept-collection-offer', acceptColOffer.relay);
offerRouter.post('/prepare/accept-collection-offer', acceptColOffer.prepare);
