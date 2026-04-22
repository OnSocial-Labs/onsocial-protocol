export interface HasuraSelectPermission {
  columns?: string[];
  filter?: unknown;
  limit?: number;
  allow_aggregations?: boolean;
}

export interface HasuraMetadataTable {
  table?: {
    name?: string;
  };
  select_permissions?: Array<{
    role?: string;
    permission?: HasuraSelectPermission;
  }>;
}

function normalizeColumns(columns: string[] = []): string[] {
  return [...columns].sort();
}

function normalizeFilter(filter: unknown): string {
  if (filter === undefined) {
    return '{}';
  }

  return JSON.stringify(filter);
}

export function permissionsMatch(
  existing: HasuraSelectPermission,
  desired: HasuraSelectPermission
): boolean {
  return (
    JSON.stringify(normalizeColumns(existing.columns)) ===
      JSON.stringify(normalizeColumns(desired.columns)) &&
    normalizeFilter(existing.filter) === normalizeFilter(desired.filter) &&
    existing.limit === desired.limit &&
    Boolean(existing.allow_aggregations) === Boolean(desired.allow_aggregations)
  );
}

export function buildPermissionIndex(
  tables: HasuraMetadataTable[]
): Map<string, Map<string, HasuraSelectPermission>> {
  const index = new Map<string, Map<string, HasuraSelectPermission>>();

  for (const table of tables) {
    const tableName = table.table?.name;
    if (!tableName) {
      continue;
    }

    const byRole = new Map<string, HasuraSelectPermission>();
    for (const permission of table.select_permissions || []) {
      if (!permission.role || !permission.permission) {
        continue;
      }

      byRole.set(permission.role, permission.permission);
    }

    index.set(tableName, byRole);
  }

  return index;
}
