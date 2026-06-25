import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cryptoStub = path.resolve(__dirname, 'src/lib/node-crypto-stub.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@onsocial/sdk'],
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
