import path from 'node:path';

function filesInPackage(files, packageDir) {
  return files.filter((file) => file.startsWith(`${packageDir}/`));
}

function relativePaths(files, packageDir) {
  return filesInPackage(files, packageDir).map((file) =>
    path.relative(packageDir, file)
  );
}

function formatAndLint(packageDir, filter) {
  return (files) => {
    const packageFiles = filesInPackage(files, packageDir);
    if (packageFiles.length === 0) {
      return [];
    }

    const relative = relativePaths(files, packageDir);
    const quotedPackageFiles = packageFiles.map((file) => `"${file}"`).join(' ');
    const quotedRelative = relative.map((file) => `"${file}"`).join(' ');

    return [
      `prettier --write ${quotedPackageFiles}`,
      `pnpm --filter ${filter} exec eslint --fix ${quotedRelative}`,
    ];
  };
}

/** @type {import('lint-staged').Configuration} */
const config = {
  'packages/onsocial-backend/**/*.{ts,tsx,js,jsx,json,md}': formatAndLint(
    'packages/onsocial-backend',
    'onsocial-backend'
  ),
  'packages/onsocial-portal/**/*.{ts,tsx,js,jsx,json,css,md}': formatAndLint(
    'packages/onsocial-portal',
    '@onsocial/portal'
  ),
  'packages/onsocial-rpc/**/*.{ts,tsx,js,jsx,json,md}': formatAndLint(
    'packages/onsocial-rpc',
    '@onsocial/rpc'
  ),
  'packages/onsocial-text-card/**/*.{ts,tsx,js,jsx,json,md}': formatAndLint(
    'packages/onsocial-text-card',
    '@onsocial/text-card'
  ),
  'packages/onsocial-sdk/**/*.{ts,tsx,js,jsx,json,md}': formatAndLint(
    'packages/onsocial-sdk',
    '@onsocial/sdk'
  ),
  'packages/onsocial-gateway/**/*.{ts,tsx,js,jsx,json,md}': formatAndLint(
    'packages/onsocial-gateway',
    'onsocial-gateway'
  ),
  'packages/onsocial-pages/**/*.{ts,tsx,js,jsx,json,md}': formatAndLint(
    'packages/onsocial-pages',
    '@onsocial/pages'
  ),
};

export default config;
