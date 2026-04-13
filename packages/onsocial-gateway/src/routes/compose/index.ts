/**
 * Compose routes — one-call content creation with automatic storage + relay.
 *
 * Modules:
 *   set             — Store content at any core contract path
 *   mint            — Mint Scarces with auto-uploaded media
 *   collection      — Create Scarces collections
 *   lazy-listing    — List content for deferred-mint purchase
 *   token           — Transfer, burn, renew, redeem, revoke, refund
 *   approval        — NEP-178 approval management
 *   collection-manage — Collection lifecycle, allowlists, metadata, purchases
 *   marketplace     — Secondary market: list, delist, auction, purchase, bid
 *   offer           — Token & collection offers
 *   app             — App pools, moderators, storage, admin
 *
 * All routes require JWT authentication. Rate limiting is handled by the
 * gateway-wide middleware (60/min free, 600/min pro) — no per-route metering.
 *
 * Every action has two endpoint variants:
 *   POST /compose/{action}         — relay via intent auth (gasless, server-side)
 *   POST /compose/prepare/{action} — return action JSON for SDK/wallet signing
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/index.js';
import { setRouter } from './set.js';
import { mintRouter } from './mint.js';
import { collectionRouter } from './collection.js';
import { lazyListingRouter } from './lazy-listing.js';
import { tokenRouter } from './token.js';
import { approvalRouter } from './approval.js';
import { collectionManageRouter } from './collection-manage.js';
import { marketplaceRouter } from './marketplace.js';
import { offerRouter } from './offer.js';
import { appRouter } from './app.js';

export const composeRouter = Router();

// All compose routes require auth (JWT or API key)
composeRouter.use(requireAuth);

// Mount feature routers
composeRouter.use(setRouter);
composeRouter.use(mintRouter);
composeRouter.use(collectionRouter);
composeRouter.use(lazyListingRouter);
composeRouter.use(tokenRouter);
composeRouter.use(approvalRouter);
composeRouter.use(collectionManageRouter);
composeRouter.use(marketplaceRouter);
composeRouter.use(offerRouter);
composeRouter.use(appRouter);
