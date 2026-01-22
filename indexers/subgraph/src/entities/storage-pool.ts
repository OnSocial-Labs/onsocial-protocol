/**
 * StoragePool Entity Helpers
 */

import { BigInt } from "@graphprotocol/graph-ts";
import { StoragePool } from "../../generated/schema";
import { ZERO_BI } from "../utils";

/**
 * Load or create a StoragePool entity
 * Pool types: "user", "group", "platform", "shared"
 */
export function ensureStoragePool(poolKey: string, timestamp: u64): StoragePool {
  let pool = StoragePool.load(poolKey);
  if (!pool) {
    pool = new StoragePool(poolKey);
    pool.poolType = "user";
    pool.balance = ZERO_BI;
    pool.createdAt = BigInt.fromU64(timestamp);
    pool.lastUpdatedAt = BigInt.fromU64(timestamp);
    pool.save();
  }
  return pool;
}
