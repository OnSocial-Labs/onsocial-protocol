#!/usr/bin/env node
/**
 * Runs lint, format, build, and test for packages affected by commits being pushed.
 * Checks directly changed packages only by default. Set PRE_PUSH_DEPENDENTS=1 to
 * also check workspace dependents (e.g. rpc → backend/portal/gateway).
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
    name: '@onsocial/portal',
    paths: ['packages/onsocial-portal/'],
    command: 'pnpm --filter @onsocial/portal run check',
  },
];

// Monitored workspace packages that depend on other monitored packages.
const WORKSPACE_DEPENDENTS = {
  '@onsocial/rpc': ['onsocial-backend', 'onsocial-gateway', '@onsocial/portal'],
  '@onsocial/text-card': ['@onsocial/sdk', 'onsocial-gateway'],
  '@onsocial/sdk': ['@onsocial/portal'],
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

function main() {
  const diffBase = getPushDiffBase();
  const changedFiles = getChangedFiles(diffBase);
  const affected = getAffectedPackages(changedFiles);

  console.log(`Pre-push checks (diff base: ${diffBase})`);

  if (changedFiles.length === 0) {
    console.log('No changed files detected; skipping package checks.');
    return;
  }

  if (affected.length === 0) {
    console.log(
      'No monitored package changes detected; skipping package checks.'
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

  for (const pkg of affected) {
    const label = pkg.reason === 'dependent' ? ' (dependent)' : '';
    console.log(`\n=== ${pkg.name}${label} ===`);
    run(pkg.command);
  }

  console.log('\nPre-push checks passed.');
}

main();
