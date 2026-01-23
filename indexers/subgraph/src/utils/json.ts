/**
 * JSON Helper Functions for OnSocial Subgraph
 */

import { JSONValue, JSONValueKind, BigInt, TypedMap } from "@graphprotocol/graph-ts";

// =============================================================================
// JSON SERIALIZATION
// =============================================================================

function escapeString(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const c = str.charAt(i);
    if (c == '"') result += '\\"';
    else if (c == "\\") result += "\\\\";
    else if (c == "\n") result += "\\n";
    else if (c == "\r") result += "\\r";
    else if (c == "\t") result += "\\t";
    else result += c;
  }
  return result;
}

/**
 * Convert any JSONValue to a valid JSON string
 */
export function jsonToString(value: JSONValue): string {
  switch (value.kind) {
    case JSONValueKind.STRING:
      return '"' + escapeString(value.toString()) + '"';
    case JSONValueKind.NUMBER:
      return value.toBigInt().toString();
    case JSONValueKind.BOOL:
      return value.toBool() ? "true" : "false";
    case JSONValueKind.NULL:
      return "null";
    case JSONValueKind.ARRAY: {
      const arr = value.toArray();
      const parts: string[] = [];
      for (let i = 0; i < arr.length; i++) parts.push(jsonToString(arr[i]));
      return "[" + parts.join(",") + "]";
    }
    case JSONValueKind.OBJECT: {
      const entries = value.toObject().entries;
      const parts: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        parts.push('"' + escapeString(entries[i].key) + '":' + jsonToString(entries[i].value));
      }
      return "{" + parts.join(",") + "}";
    }
    default:
      return "null";
  }
}

// =============================================================================
// VALUE EXTRACTORS
// =============================================================================

export function getString(obj: TypedMap<string, JSONValue>, key: string, defaultValue: string): string {
  const f = obj.get(key);
  return f && !f.isNull() ? f.toString() : defaultValue;
}

export function getStringOrNull(obj: TypedMap<string, JSONValue>, key: string): string | null {
  const f = obj.get(key);
  return f && !f.isNull() ? f.toString() : null;
}

export function getInt(obj: TypedMap<string, JSONValue>, key: string): i32 {
  const f = obj.get(key);
  return f && !f.isNull() && f.kind == JSONValueKind.NUMBER ? (f.toI64() as i32) : 0;
}

export function getBigInt(obj: TypedMap<string, JSONValue>, key: string): BigInt | null {
  const f = obj.get(key);
  if (!f || f.isNull()) return null;
  if (f.kind == JSONValueKind.NUMBER) return f.toBigInt();
  if (f.kind == JSONValueKind.STRING && f.toString().length > 0) return BigInt.fromString(f.toString());
  return null;
}

export function getBool(obj: TypedMap<string, JSONValue>, key: string): boolean {
  const f = obj.get(key);
  return f && !f.isNull() && f.kind == JSONValueKind.BOOL ? f.toBool() : false;
}

export function getArray(obj: TypedMap<string, JSONValue>, key: string): JSONValue[] | null {
  const f = obj.get(key);
  return f && !f.isNull() && f.kind == JSONValueKind.ARRAY ? f.toArray() : null;
}

export function getObject(obj: TypedMap<string, JSONValue>, key: string): TypedMap<string, JSONValue> | null {
  const f = obj.get(key);
  return f && !f.isNull() && f.kind == JSONValueKind.OBJECT ? f.toObject() : null;
}

// =============================================================================
// PATH UTILITIES
// =============================================================================

export function extractGroupIdFromPath(path: string): string | null {
  const parts = path.split("/");
  if (parts.length >= 2 && parts[0] == "groups") return parts[1];
  if (parts.length >= 3 && parts[1] == "groups") return parts[2];
  return null;
}
