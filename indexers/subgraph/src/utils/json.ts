/**
 * JSON Helper Functions for OnSocial Subgraph
 * Safe extraction of values from TypedMap<string, JSONValue>
 */

import { JSONValue, JSONValueKind, BigInt, TypedMap } from "@graphprotocol/graph-ts";

// =============================================================================
// JSON TO STRING CONVERSION
// =============================================================================

/**
 * Safely convert any JSONValue to a string representation
 * Handles all JSON types: string, number, bool, null, array, object
 */
export function jsonToString(value: JSONValue): string {
  if (value.kind == JSONValueKind.STRING) {
    return value.toString();
  } else if (value.kind == JSONValueKind.NUMBER) {
    return value.toBigInt().toString();
  } else if (value.kind == JSONValueKind.BOOL) {
    return value.toBool() ? "true" : "false";
  } else if (value.kind == JSONValueKind.NULL) {
    return "null";
  } else if (value.kind == JSONValueKind.ARRAY) {
    let arr = value.toArray();
    let parts: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      parts.push(jsonToString(arr[i]));
    }
    return "[" + parts.join(",") + "]";
  } else if (value.kind == JSONValueKind.OBJECT) {
    let obj = value.toObject();
    let entries = obj.entries;
    let parts: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      let key = entries[i].key;
      let val = jsonToString(entries[i].value);
      parts.push('"' + key + '":' + val);
    }
    return "{" + parts.join(",") + "}";
  }
  return "";
}

// =============================================================================
// VALUE EXTRACTORS
// =============================================================================

/**
 * Get string value with default fallback
 */
export function getString(
  obj: TypedMap<string, JSONValue>,
  key: string,
  defaultValue: string
): string {
  const field = obj.get(key);
  if (field && !field.isNull()) {
    return jsonToString(field);
  }
  return defaultValue;
}

/**
 * Get string value or null
 */
export function getStringOrNull(
  obj: TypedMap<string, JSONValue>,
  key: string
): string | null {
  const field = obj.get(key);
  if (field && !field.isNull()) {
    return jsonToString(field);
  }
  return null;
}

/**
 * Get i32 value with 0 default
 */
export function getInt(obj: TypedMap<string, JSONValue>, key: string): i32 {
  const field = obj.get(key);
  if (field && !field.isNull() && field.kind == JSONValueKind.NUMBER) {
    return field.toI64() as i32;
  }
  return 0;
}

/**
 * Get BigInt value or null
 * Handles both NUMBER and STRING JSON types
 */
export function getBigInt(
  obj: TypedMap<string, JSONValue>,
  key: string
): BigInt | null {
  const field = obj.get(key);
  if (field && !field.isNull()) {
    if (field.kind == JSONValueKind.NUMBER) {
      return BigInt.fromString(field.toBigInt().toString());
    } else if (field.kind == JSONValueKind.STRING) {
      const str = field.toString();
      if (str.length > 0) {
        return BigInt.fromString(str);
      }
    }
  }
  return null;
}

/**
 * Get boolean value with false default
 */
export function getBool(obj: TypedMap<string, JSONValue>, key: string): boolean {
  const field = obj.get(key);
  if (field && !field.isNull() && field.kind == JSONValueKind.BOOL) {
    return field.toBool();
  }
  return false;
}

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Extract group ID from a path like "groups/{id}/..." or "{account}/groups/{id}/..."
 */
export function extractGroupIdFromPath(path: string): string | null {
  const parts = path.split("/");
  // Format: groups/{groupId}/...
  if (parts.length >= 2 && parts[0] == "groups") {
    return parts[1];
  }
  // Format: {account}/groups/{groupId}/...
  if (parts.length >= 3 && parts[1] == "groups") {
    return parts[2];
  }
  return null;
}
