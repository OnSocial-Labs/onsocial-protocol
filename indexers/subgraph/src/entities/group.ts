/**
 * Group and GroupMember Entity Helpers
 */

import { BigInt } from "@graphprotocol/graph-ts";
import { Group, GroupMember } from "../../generated/schema";
import { ZERO_BI, ONE_BI } from "../utils";

/**
 * Load or create a Group entity
 * Initializes with default values if new
 */
export function ensureGroup(groupId: string, owner: string, timestamp: u64): Group {
  let group = Group.load(groupId);
  if (!group) {
    group = new Group(groupId);
    group.owner = owner;
    group.previousOwners = [];
    group.createdAt = BigInt.fromU64(timestamp);
    group.lastActivityAt = BigInt.fromU64(timestamp);
    group.memberCount = 0;
    group.updateCount = 0;
    group.proposalCount = 0;
    group.activeProposalCount = 0;
    group.pendingJoinRequestCount = 0;
    group.isPrivate = false;
    group.poolBalance = ZERO_BI;
    group.hasPool = false;
    group.hasSponsorConfig = false;
    // Voting config fields left as default (null) until voting_config_changed event
    group.save();
  }
  return group;
}

/**
 * Load or create a GroupMember entity
 * ID format: {groupId}-{memberId}
 */
export function ensureGroupMember(
  groupId: string,
  memberId: string,
  timestamp: u64
): GroupMember {
  const id = groupId + "-" + memberId;
  let member = GroupMember.load(id);
  if (!member) {
    member = new GroupMember(id);
    member.groupId = groupId;
    member.memberId = memberId;
    member.level = 0;
    member.nonce = ONE_BI;
    member.isActive = true;
    member.isBlacklisted = false;
    member.joinedAt = BigInt.fromU64(timestamp);
    member.lastActiveAt = BigInt.fromU64(timestamp);
    member.group = groupId;
    member.save();
  }
  return member;
}
