#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read root package.json
const rootPackagePath = path.join(__dirname, '..', 'package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));

// Get all dependencies from root
const rootDeps = {
  ...rootPackage.dependencies,
  ...rootPackage.devDependencies,
  ...rootPackage.peerDependencies
};

let hasMismatches = false;

// Function to check a package
function checkPackage(packagePath) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const mismatches = [];

  // Check dependencies
  ['dependencies', 'devDependencies', 'peerDependencies'].forEach(depType => {
    if (packageJson[depType]) {
      Object.keys(packageJson[depType]).forEach(depName => {
        // Skip workspace dependencies (onsocial-*)
        if (depName.startsWith('onsocial-')) {
          return;
        }

        // Check if this dependency exists in root
        if (rootDeps[depName]) {
          const currentVersion = packageJson[depType][depName];
          const rootVersion = rootDeps[depName];
          
          if (currentVersion !== rootVersion) {
            mismatches.push({
              dependency: depName,
              type: depType,
              currentVersion,
              rootVersion
            });
          }
        }
      });
    }
  });

  if (mismatches.length > 0) {
    hasMismatches = true;
    console.log(`❌ ${packageJson.name}:`);
    mismatches.forEach(m => {
      console.log(`   ${m.dependency} (${m.type}): ${m.currentVersion} → should be ${m.rootVersion}`);
    });
  } else {
    console.log(`✅ ${packageJson.name}: All dependencies in sync`);
  }
}

// Process all packages
const packagesDir = path.join(__dirname, '..', 'packages');
if (fs.existsSync(packagesDir)) {
  const packages = fs.readdirSync(packagesDir)
    .filter(name => fs.statSync(path.join(packagesDir, name)).isDirectory());

  console.log('🔍 Checking dependency versions...\n');
  
  packages.forEach(packageName => {
    checkPackage(path.join(packagesDir, packageName));
  });

  if (hasMismatches) {
    console.log('\n⚠️  Dependencies are out of sync! Run "pnpm sync-deps" to fix.');
    process.exit(1);
  } else {
    console.log('\n✨ All dependencies are in sync!');
  }
} else {
  console.log('❌ packages directory not found');
  process.exit(1);
}
