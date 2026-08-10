#!/usr/bin/env node
/**
 * Runs lint, format, build, and test for packages affected by commits being pushed.
 * Checks directly changed packages only by default. Set PRE_PUSH_DEPENDENTS=1 to
 * also check workspace dependents (e.g. rpc → backend/portal/gateway).
 * Also runs substreams SQL validate and/or schema-parity + golden_db when those
 * indexer paths change (mirrors the Substreams CI gaps SQL-only miss).
 * Invoked by .husky/pre-push and `pnpm check:push`.
 */
import { execSync } from 'node:child_process';

// Dependency order: libraries first, then services/apps that import them.
const PACKAGE_CHECKS = [
  {
    name: '@onsocial/rpc',
    paths: ['packages/onsocial-rpc/'],
    command: 'pnpm --filter @onsocial/rpc run check',
  },
  {
    name: '@onsocial/text-card',
    paths: ['packages/onsocial-text-card/'],
    command: 'pnpm --filter @onsocial/text-card run check',
  },
  {
    name: '@onsocial/ui',
    paths: ['packages/onsocial-ui/'],
    command: 'pnpm --filter @onsocial/ui run check',
  },
  {
    name: '@onsocial/sdk',
    paths: ['packages/onsocial-sdk/'],
    command: 'pnpm --filter @onsocial/sdk run check',
  },
  {
    name: 'onsocial-backend',
    paths: ['packages/onsocial-backend/'],
    command: 'pnpm --filter onsocial-backend run check',
  },
  {
    name: 'onsocial-gateway',
    paths: ['packages/onsocial-gateway/'],
    command: 'pnpm --filter onsocial-gateway run check',
  },
  {
    name: '@onsocial/pages',
    paths: ['packages/onsocial-pages/'],
    command: 'pnpm --filter @onsocial/pages run check',
  },
  {
    name: '@onsocial/app',
    paths: ['packages/onsocial-app/'],
    command: 'pnpm --filter @onsocial/app run check',
  },
  {
    name: '@onsocial/portal',
    paths: ['packages/onsocial-portal/'],
    command: 'pnpm --filter @onsocial/portal run check',
  },
];

// Monitored workspace packages that depend on other monitored packages.
const WORKSPACE_DEPENDENTS = {
  '@onsocial/rpc': ['onsocial-backend', 'onsocial-gateway', '@onsocial/portal'],
  '@onsocial/text-card': ['@onsocial/sdk', 'onsocial-gateway'],
  '@onsocial/sdk': ['@onsocial/portal', '@onsocial/app'],
  '@onsocial/ui': ['@onsocial/portal', '@onsocial/app'],
};

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', ...options });
}

function getPushDiffBase() {
  const upstream = process.env.PRE_PUSH_UPSTREAM;
  if (upstream) {
    return upstream;
  }

  try {
    execSync('git rev-parse --abbrev-ref @{upstream}', { stdio: 'pipe' });
    return '@{upstream}';
  } catch {
    for (const base of ['origin/main', 'origin/master', 'main', 'master']) {
      try {
        execSync(`git rev-parse --verify ${base}`, { stdio: 'pipe' });
        return base;
      } catch {
        // try next base
      }
    }
  }

  return 'HEAD~1';
}

function getChangedFiles(base) {
  const output = execSync(`git diff --name-only ${base}..HEAD`, {
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function getDirectlyChangedPackages(changedFiles) {
  const changed = new Set();

  for (const pkg of PACKAGE_CHECKS) {
    if (
      changedFiles.some((file) =>
        pkg.paths.some((prefix) => file.startsWith(prefix))
      )
    ) {
      changed.add(pkg.name);
    }
  }

  return changed;
}

function shouldExpandDependents() {
  return (
    process.env.PRE_PUSH_DEPENDENTS === '1' ||
    process.env.PRE_PUSH_DEPENDENTS === 'true' ||
    process.env.PRE_PUSH_DEPENDENTS === 'yes'
  );
}

function expandWithDependents(changedPackageNames) {
  if (!shouldExpandDependents()) {
    return new Set(changedPackageNames);
  }

  const expanded = new Set(changedPackageNames);
  let added = true;

  while (added) {
    added = false;

    for (const packageName of expanded) {
      for (const dependent of WORKSPACE_DEPENDENTS[packageName] ?? []) {
        if (!expanded.has(dependent)) {
          expanded.add(dependent);
          added = true;
        }
      }
    }
  }

  return expanded;
}

function getAffectedPackages(changedFiles) {
  const directlyChanged = getDirectlyChangedPackages(changedFiles);
  const expandedNames = expandWithDependents(directlyChanged);

  return PACKAGE_CHECKS.filter((pkg) => expandedNames.has(pkg.name)).map(
    (pkg) => ({
      ...pkg,
      reason: directlyChanged.has(pkg.name) ? 'changed' : 'dependent',
    })
  );
}

/** Schema / migration / SQL validation script changes under the indexer. */
function substreamsSqlChanged(changedFiles) {
  return changedFiles.some(
    (file) =>
      (file.startsWith('indexers/substreams/') && file.endsWith('.sql')) ||
      file === 'indexers/substreams/scripts/validate_sql.sh' ||
      file.startsWith('indexers/substreams/tests/fixtures/')
  );
}

/**
 * Sink writer / golden fixture changes — mirrors Substreams CI steps that
 * `validate_sql.sh` does not cover (schema parity + golden_db cargo tests).
 */
function substreamsSinkChanged(changedFiles) {
  return changedFiles.some(
    (file) =>
      file.startsWith('indexers/substreams/src/') ||
      file === 'indexers/substreams/tests/golden_db_fixtures.json' ||
      file === 'indexers/substreams/scripts/check_db_schema_parity.py' ||
      file === 'indexers/substreams/Cargo.toml' ||
      file === 'indexers/substreams/Cargo.lock'
  );
}

function runSubstreamsSqlValidation() {
  console.log('\n=== indexers/substreams (SQL schema upgrade) ===');
  run('bash indexers/substreams/scripts/validate_sql.sh');
}

function runSubstreamsSinkValidation() {
  console.log('\n=== indexers/substreams (schema parity + golden_db) ===');
  run('python3 scripts/check_db_schema_parity.py', {
    cwd: 'indexers/substreams',
  });
  run('cargo test golden_db', { cwd: 'indexers/substreams' });
}

function main() {
  const diffBase = getPushDiffBase();
  const changedFiles = getChangedFiles(diffBase);
  const affected = getAffectedPackages(changedFiles);
  const checkSubstreamsSql = substreamsSqlChanged(changedFiles);
  const checkSubstreamsSink = substreamsSinkChanged(changedFiles);

  console.log(`Pre-push checks (diff base: ${diffBase})`);

  if (changedFiles.length === 0) {
    console.log('No changed files detected; skipping package checks.');
    return;
  }

  if (affected.length === 0 && !checkSubstreamsSql && !checkSubstreamsSink) {
    console.log(
      'No monitored package or substreams changes detected; skipping checks.'
    );
    return;
  }

  const changed = affected
    .filter((pkg) => pkg.reason === 'changed')
    .map((pkg) => pkg.name);
  const dependents = affected
    .filter((pkg) => pkg.reason === 'dependent')
    .map((pkg) => pkg.name);

  if (changed.length > 0) {
    console.log(`Changed packages: ${changed.join(', ')}`);
  }
  if (dependents.length > 0) {
    console.log(`Dependent packages: ${dependents.join(', ')}`);
  }
  if (checkSubstreamsSql) {
    console.log('Changed: indexers/substreams SQL schema / migrations');
  }
  if (checkSubstreamsSink) {
    console.log('Changed: indexers/substreams sink / golden fixtures');
  }

  for (const pkg of affected) {
    const label = pkg.reason === 'dependent' ? ' (dependent)' : '';
    console.log(`\n=== ${pkg.name}${label} ===`);
    run(pkg.command);
  }

  if (checkSubstreamsSql) {
    runSubstreamsSqlValidation();
  }
  if (checkSubstreamsSink) {
    runSubstreamsSinkValidation();
  }

  console.log('\nPre-push checks passed.');
}

main();
