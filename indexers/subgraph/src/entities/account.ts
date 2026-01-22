/**
 * Account Entity Helpers
 */

import { BigInt } from "@graphprotocol/graph-ts";
import { Account } from "../../generated/schema";
import { ZERO_BI } from "../utils";

/**
 * Load or create an Account entity
 * Initializes with default values if new
 */
export function ensureAccount(accountId: string, timestamp: u64): Account {
  let account = Account.load(accountId);
  if (!account) {
    account = new Account(accountId);
    account.storageBalance = ZERO_BI;
    account.firstSeenAt = BigInt.fromU64(timestamp);
    account.lastActiveAt = BigInt.fromU64(timestamp);
    account.dataUpdateCount = 0;
    account.storageUpdateCount = 0;
    account.permissionUpdateCount = 0;
    account.save();
  }
  return account;
}
