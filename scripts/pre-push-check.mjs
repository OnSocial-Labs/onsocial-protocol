#!/usr/bin/env node
/**
 * Runs lint, format, build, and test for packages affected by commits being pushed.
 * Checks directly changed packages only by default. Set PRE_PUSH_DEPENDENTS=1 to
 * also check workspace dependents (e.g. rpc → backend/portal/gateway).
 * Also runs substreams SQL validate and/or schema-parity + golden_db when those
 * indexer paths change (mirrors the Substreams CI gaps SQL-only miss).
 * Cloud agents (CURSOR_AGENT=1) also run App Playwright when App CI paths
 * change — same gap this morning’s main red: husky/check:push is not e2e.
 * Laptop husky stays lint/unit/build. Opt in with PRE_PUSH_E2E=1; skip with 0.
 * Invoked by .husky/pre-push and `pnpm check:push`.
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Dependency order: libraries first, then services/apps that import them.
// Keep @onsocial/sdk before @onsocial/ui — ui imports TipTap helpers from sdk.
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
    name: '@onsocial/sdk',
    paths: ['packages/onsocial-sdk/'],
    command: 'pnpm --filter @onsocial/sdk run check',
  },
  {
    name: '@onsocial/ui',
    paths: ['packages/onsocial-ui/'],
    command: 'pnpm --filter @onsocial/ui run check',
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

// Upstream workspace libs that must be built/checked before a package (dist is gitignored).
const WORKSPACE_DEPENDENCIES = {
  '@onsocial/sdk': ['@onsocial/text-card'],
  '@onsocial/ui': ['@onsocial/sdk'],
  'onsocial-backend': ['@onsocial/rpc'],
  'onsocial-gateway': ['@onsocial/rpc', '@onsocial/text-card'],
  '@onsocial/portal': ['@onsocial/sdk', '@onsocial/ui', '@onsocial/rpc'],
  '@onsocial/app': ['@onsocial/sdk', '@onsocial/ui'],
};

// Monitored workspace packages that depend on other monitored packages.
const WORKSPACE_DEPENDENTS = {
  '@onsocial/rpc': ['onsocial-backend', 'onsocial-gateway', '@onsocial/portal'],
  '@onsocial/text-card': ['@onsocial/sdk', 'onsocial-gateway'],
  '@onsocial/sdk': ['@onsocial/ui', '@onsocial/portal', '@onsocial/app'],
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

function expandClosure(seedNames, edges) {
  const expanded = new Set(seedNames);
  let added = true;

  while (added) {
    added = false;

    for (const packageName of expanded) {
      for (const related of edges[packageName] ?? []) {
        if (!expanded.has(related)) {
          expanded.add(related);
          added = true;
        }
      }
    }
  }

  return expanded;
}

function expandWithDependents(changedPackageNames) {
  if (!shouldExpandDependents()) {
    return new Set(changedPackageNames);
  }

  return expandClosure(changedPackageNames, WORKSPACE_DEPENDENTS);
}

/** Always pull in upstream workspace libs so tsc can resolve gitignored dist/. */
function expandWithDependencies(packageNames) {
  return expandClosure(packageNames, WORKSPACE_DEPENDENCIES);
}

function getAffectedPackages(changedFiles) {
  const directlyChanged = getDirectlyChangedPackages(changedFiles);
  const withDependents = expandWithDependents(directlyChanged);
  const expandedNames = expandWithDependencies(withDependents);

  return PACKAGE_CHECKS.filter((pkg) => expandedNames.has(pkg.name)).map(
    (pkg) => {
      let reason = 'dependency';
      if (directlyChanged.has(pkg.name)) {
        reason = 'changed';
      } else if (withDependents.has(pkg.name)) {
        reason = 'dependent';
      }
      return {
        ...pkg,
        reason,
      };
    }
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

/** Same path filter as `.github/workflows/onsocial-app-ci.yml`. */
export function appCiPlaywrightPathsChanged(changedFiles) {
  return changedFiles.some(
    (file) =>
      file.startsWith('packages/onsocial-app/') ||
      file.startsWith('packages/onsocial-ui/') ||
      file.startsWith('packages/onsocial-sdk/') ||
      file.startsWith('packages/onsocial-text-card/') ||
      file.startsWith('packages/onsocial-rpc/') ||
      file === 'pnpm-lock.yaml' ||
      file === '.github/workflows/onsocial-app-ci.yml'
  );
}

export function prePushGateChanged(changedFiles) {
  return changedFiles.some(
    (file) =>
      file === 'scripts/pre-push-check.mjs' ||
      file === 'scripts/pre-push-check.test.mjs'
  );
}

function envFlagOn(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

function envFlagOff(value) {
  return value === '0' || value === 'false' || value === 'no';
}

/**
 * Playwright matches App CI in cloud. Laptop husky does not run it.
 * PRE_PUSH_E2E=1 forces it; PRE_PUSH_E2E=0 skips it even on a cloud agent.
 */
export function shouldRunAppPlaywright(env = process.env) {
  if (envFlagOff(env.PRE_PUSH_E2E)) return false;
  if (envFlagOn(env.PRE_PUSH_E2E)) return true;
  return env.CURSOR_AGENT === '1';
}

function runPrePushGateSelfTest() {
  console.log('\n=== scripts/pre-push-check (helpers) ===');
  run('node --test scripts/pre-push-check.test.mjs');
}

function runAppPlaywright() {
  console.log('\n=== @onsocial/app Playwright (cloud gate = App CI e2e) ===');
  try {
    run(
      'pnpm --filter @onsocial/app exec playwright install --with-deps chromium'
    );
  } catch {
    console.log(
      'playwright install --with-deps failed; falling back to chromium-only'
    );
    run('pnpm --filter @onsocial/app exec playwright install chromium');
  }
  run('pnpm --filter @onsocial/app test:e2e', {
    env: {
      ...process.env,
      // Match OnSocial App CI: production next start, 1 worker, retries.
      CI: 'true',
      ONSOCIAL_API_KEY:
        process.env.ONSOCIAL_API_KEY ?? 'cloud-check-placeholder',
      NEXT_PUBLIC_NEAR_NETWORK:
        process.env.NEXT_PUBLIC_NEAR_NETWORK ?? 'testnet',
      E2E_GRAPH_STUBS: process.env.E2E_GRAPH_STUBS ?? '1',
      NEXT_PUBLIC_E2E_WALLET: process.env.NEXT_PUBLIC_E2E_WALLET ?? '1',
    },
  });
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
  const checkAppPlaywright = appCiPlaywrightPathsChanged(changedFiles);
  const checkPrePushGate = prePushGateChanged(changedFiles);

  console.log(`Pre-push checks (diff base: ${diffBase})`);

  if (changedFiles.length === 0) {
    console.log('No changed files detected; skipping package checks.');
    return;
  }

  if (
    affected.length === 0 &&
    !checkSubstreamsSql &&
    !checkSubstreamsSink &&
    !checkAppPlaywright &&
    !checkPrePushGate
  ) {
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
  const dependencies = affected
    .filter((pkg) => pkg.reason === 'dependency')
    .map((pkg) => pkg.name);

  if (changed.length > 0) {
    console.log(`Changed packages: ${changed.join(', ')}`);
  }
  if (dependents.length > 0) {
    console.log(`Dependent packages: ${dependents.join(', ')}`);
  }
  if (dependencies.length > 0) {
    console.log(`Dependency packages: ${dependencies.join(', ')}`);
  }
  if (checkSubstreamsSql) {
    console.log('Changed: indexers/substreams SQL schema / migrations');
  }
  if (checkSubstreamsSink) {
    console.log('Changed: indexers/substreams sink / golden fixtures');
  }
  if (checkAppPlaywright) {
    console.log('Changed: App CI Playwright paths');
  }
  if (checkPrePushGate) {
    console.log('Changed: scripts/pre-push-check');
  }

  for (const pkg of affected) {
    if (pkg.reason === 'dependency') {
      // Unchanged upstream libs: build dist/ only (do not full-check).
      console.log(`\n=== ${pkg.name} (dependency build) ===`);
      run(`pnpm --filter ${pkg.name} run build`);
      continue;
    }
    const label = pkg.reason === 'dependent' ? ' (dependent)' : '';
    console.log(`\n=== ${pkg.name}${label} ===`);
    run(pkg.command);
  }

  if (checkPrePushGate) {
    runPrePushGateSelfTest();
  }

  if (checkSubstreamsSql) {
    runSubstreamsSqlValidation();
  }
  if (checkSubstreamsSink) {
    runSubstreamsSinkValidation();
  }

  if (checkAppPlaywright) {
    if (shouldRunAppPlaywright()) {
      runAppPlaywright();
    } else {
      console.log(
        '\nSkipping Playwright (laptop husky). Cloud agents run App CI e2e via CURSOR_AGENT=1 or PRE_PUSH_E2E=1.'
      );
    }
  }

  console.log('\nPre-push checks passed.');
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isExecutedDirectly()) {
  main();
}
