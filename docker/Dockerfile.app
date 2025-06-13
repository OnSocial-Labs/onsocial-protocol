# Dockerfile for OnSocial App (Expo/React Native)
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY packages/onsocial-app/package.json ./
COPY pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --no-frozen-lockfile

# Copy source code
COPY packages/onsocial-app .

# Expose Expo port (default 8081)
EXPOSE 8081

# Start the Expo app
CMD ["pnpm", "start"]