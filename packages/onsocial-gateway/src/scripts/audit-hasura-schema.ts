#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_ONLY_TABLES,
  INTENTIONALLY_UNEXPOSED_RELATIONS,
  PUBLIC_TABLES,
} from '../config/hasuraPermissionCatalog.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../..');
const schemaDir = path.join(repoRoot, 'indexers', 'substreams');

const RELATION_REGEX =
  /CREATE\s+(?:MATERIALIZED\s+VIEW|VIEW|TABLE)\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/g;
const TABLE_BLOCK_REGEX =
  /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\);/g;
const SKIPPED_TABLE_TOKENS = new Set([
  'primary',
  'unique',
  'constraint',
  'foreign',
  'check',
]);

function parseRelationNames(sql: string): string[] {
  return Array.from(sql.matchAll(RELATION_REGEX), (match) => match[1]);
}

function parseTableColumns(sql: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();

  for (const match of sql.matchAll(TABLE_BLOCK_REGEX)) {
    const [, tableName, body] = match;
    const columns: string[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('--')) {
        continue;
      }

      const token = line.split(/\s+/)[0]?.replace(/[,()]/g, '').toLowerCase();
      if (!token || SKIPPED_TABLE_TOKENS.has(token)) {
        continue;
      }

      columns.push(token);
    }

    tables.set(tableName, columns);
  }

  return tables;
}

async function loadSchemas(): Promise<{
  relationNames: Set<string>;
  tableColumns: Map<string, string[]>;
}> {
  const files = (await readdir(schemaDir))
    .filter(
      (entry) => entry.endsWith('.sql') && entry !== 'combined_schema.sql'
    )
    .sort();

  const relationNames = new Set<string>();
  const tableColumns = new Map<string, string[]>();

  for (const fileName of files) {
    const fullPath = path.join(schemaDir, fileName);
    const sql = await readFile(fullPath, 'utf8');

    for (const name of parseRelationNames(sql)) {
      relationNames.add(name);
    }

    for (const [tableName, columns] of parseTableColumns(sql)) {
      tableColumns.set(tableName, columns);
    }
  }

  return { relationNames, tableColumns };
}

function formatList(values: string[]): string {
  return values.length === 0 ? 'none' : values.join(', ');
}

async function main(): Promise<void> {
  const { relationNames, tableColumns } = await loadSchemas();

  const publicNames = new Set(PUBLIC_TABLES.map((table) => table.name));
  const adminOnlyNames = new Set(ADMIN_ONLY_TABLES);
  const intentionallyUnexposed = new Set(INTENTIONALLY_UNEXPOSED_RELATIONS);

  const missingPublicRelations = PUBLIC_TABLES.map(
    (table) => table.name
  ).filter((name) => !relationNames.has(name));

  const uncoveredRelations = Array.from(relationNames)
    .filter(
      (name) =>
        !publicNames.has(name) &&
        !adminOnlyNames.has(name) &&
        !intentionallyUnexposed.has(name) &&
        name !== 'schema_migrations'
    )
    .sort();

  const unexpectedIntentionalRelations =
    INTENTIONALLY_UNEXPOSED_RELATIONS.filter(
      (name) => !relationNames.has(name)
    );

  const columnMismatches = PUBLIC_TABLES.filter((table) =>
    tableColumns.has(table.name)
  )
    .map((table) => {
      const actualColumns = tableColumns.get(table.name) ?? [];
      const missingColumns = actualColumns.filter(
        (column) => !table.columns.includes(column)
      );
      const extraColumns = table.columns.filter(
        (column) => !actualColumns.includes(column)
      );

      return {
        table: table.name,
        missingColumns,
        extraColumns,
      };
    })
    .filter(
      (result) =>
        result.missingColumns.length > 0 || result.extraColumns.length > 0
    );

  console.log('Hasura schema audit');
  console.log(`Public relations configured: ${PUBLIC_TABLES.length}`);
  console.log(`Relations discovered in schema SQL: ${relationNames.size}`);
  console.log('');
  console.log(
    `Missing configured public relations: ${formatList(missingPublicRelations)}`
  );
  console.log(`Uncovered schema relations: ${formatList(uncoveredRelations)}`);
  console.log(
    `Intentional omissions missing from schema: ${formatList(unexpectedIntentionalRelations)}`
  );

  if (columnMismatches.length > 0) {
    console.log('');
    console.log('Column mismatches:');
    for (const mismatch of columnMismatches) {
      console.log(`- ${mismatch.table}`);
      console.log(
        `  missing in catalog: ${formatList(mismatch.missingColumns)}`
      );
      console.log(`  extra in catalog: ${formatList(mismatch.extraColumns)}`);
    }
  }

  if (
    missingPublicRelations.length > 0 ||
    uncoveredRelations.length > 0 ||
    columnMismatches.length > 0 ||
    unexpectedIntentionalRelations.length > 0
  ) {
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('Audit passed');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
