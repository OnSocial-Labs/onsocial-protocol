#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read root package.json
const rootPackagePath = path.join(__dirname, '..', 'package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));

// Get all dependencies from root package.json
function getRootDeps(type) {
  return (rootPackage[type]) || {};
}
const rootDependencies = getRootDeps('dependencies');
const rootDevDependencies = getRootDeps('devDependencies');

// Function to check and sync a package
function syncPackage(packagePath) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  let modified = false;

  // Check dependencies and devDependencies
  [['dependencies', rootDependencies], ['devDependencies', rootDevDependencies]].forEach(([depType, rootDeps]) => {
    if (packageJson[depType]) {
      Object.keys(packageJson[depType]).forEach(depName => {
        // Skip workspace dependencies (onsocial-*)
        if (depName.startsWith('onsocial-')) {
          return;
        }
        // Check if this dependency exists in root deps
        if (rootDeps[depName]) {
          const currentVersion = packageJson[depType][depName];
          const rootVersion = rootDeps[depName];
          if (currentVersion !== rootVersion) {
            console.log(`📦 ${packageJson.name}: Updating ${depName} from ${currentVersion} to ${rootVersion}`);
            packageJson[depType][depName] = rootVersion;
            modified = true;
          }
        }
      });
    }
  });

  // Write back if modified
  if (modified) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`✅ Updated ${packageJson.name}`);
  } else {
    console.log(`✓ ${packageJson.name} is already in sync`);
  }
}

// Process all packages
const packagesDir = path.join(__dirname, '..', 'packages');
if (fs.existsSync(packagesDir)) {
  const packages = fs.readdirSync(packagesDir)
    .filter(name => fs.statSync(path.join(packagesDir, name)).isDirectory());

  console.log('🔄 Syncing dependency versions with root dependencies/devDependencies...\n');
  
  packages.forEach(packageName => {
    syncPackage(path.join(packagesDir, packageName));
  });

  console.log('\n✨ Dependency sync complete!');
} else {
  console.log('❌ packages directory not found');
}
