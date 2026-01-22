/**
 * =============================================================================
 * OnSocial Core Contract Subgraph Mapping
 * Complete handler for all NEP-297 events emitted by core-onsocial contract
 * =============================================================================
 */

import {
  near,
  json,
  JSONValueKind,
  log,
} from "@graphprotocol/graph-ts";

import {
  handleDataUpdate,
  handleStorageUpdate,
  handleGroupUpdate,
  handleContractUpdate,
  handlePermissionUpdate,
} from "./handlers";

// =============================================================================
// MAIN RECEIPT HANDLER
// =============================================================================

export function handleReceipt(receipt: near.ReceiptWithOutcome): void {
  const outcome = receipt.outcome;
  const logs = outcome.logs;

  for (let i = 0; i < logs.length; i++) {
    const logStr = logs[i];

    if (!logStr.startsWith("EVENT_JSON:")) {
      continue;
    }

    const jsonStr = logStr.substring(11);
    const jsonResult = json.try_fromString(jsonStr);

    if (!jsonResult.isOk) {
      log.warning("[OnSocial] Failed to parse EVENT_JSON: {}", [jsonStr.substring(0, 100)]);
      continue;
    }

    const eventWrapper = jsonResult.value.toObject();
    const standard = eventWrapper.get("standard");
    if (!standard || standard.toString() != "onsocial") {
      continue;
    }

    const eventType = eventWrapper.get("event");
    if (!eventType) {
      continue;
    }
    const typeStr = eventType.toString();

    const dataField = eventWrapper.get("data");
    if (!dataField || dataField.kind != JSONValueKind.ARRAY) {
      continue;
    }
    const dataArray = dataField.toArray();
    if (dataArray.length == 0) {
      continue;
    }

    const eventData = dataArray[0].toObject();

    if (typeStr == "DATA_UPDATE") {
      handleDataUpdate(eventData, receipt, i);
    } else if (typeStr == "STORAGE_UPDATE") {
      handleStorageUpdate(eventData, receipt, i);
    } else if (typeStr == "GROUP_UPDATE") {
      handleGroupUpdate(eventData, receipt, i);
    } else if (typeStr == "CONTRACT_UPDATE") {
      handleContractUpdate(eventData, receipt, i);
    } else if (typeStr == "PERMISSION_UPDATE") {
      handlePermissionUpdate(eventData, receipt, i);
    }
  }
}

