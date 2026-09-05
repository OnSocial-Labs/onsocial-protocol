import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cryptoStub = path.resolve(__dirname, 'src/lib/node-crypto-stub.js');
const require = createRequire(import.meta.url);

/** Turbopack rejects `pdf.worker.min.mjs?url`. Serve the worker from /public. */
function copyPdfWorker() {
  const destDir = path.resolve(__dirname, 'public/pdfjs');
  try {
    mkdirSync(destDir, { recursive: true });
    copyFileSync(
      require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
      path.join(destDir, 'pdf.worker.min.mjs')
    );
  } catch {
    // pdfjs-dist may not be installed yet during a clean checkout.
  }
}

copyPdfWorker();

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@onsocial/sdk', 'pdfjs-dist'],
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Turbopack is the default bundler in Next.js 16
  turbopack: {
    resolveAlias: {
      'node:crypto': { browser: './src/lib/node-crypto-stub.js' },
    },
  },
  // Keep webpack config as fallback for `next build --webpack`
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:crypto$/, cryptoStub)
      );
      config.plugins.push({
        apply: (compiler) => {
          compiler.hooks.normalModuleFactory.tap('NodeCryptoStub', (factory) => {
            factory.hooks.beforeResolve.tap('NodeCryptoStub', (resolveData) => {
              if (resolveData?.request === 'node:crypto') {
                resolveData.request = cryptoStub;
              }
            });
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
