# Add ARG for base image with default value
ARG BASE_IMAGE=node:slim
FROM ${BASE_IMAGE} AS builder

# Update npm and install pnpm, expo-cli, and npm-check-updates globally
RUN npm install -g npm@latest && \
    npm install -g pnpm@10.11.0 expo-cli npm-check-updates@latest

# Create directories with appropriate permissions
RUN mkdir -p /home/node/.npm /app/.pnpm-store && \
    chown node:node /home/node/.npm /app/.pnpm-store && \
    chmod 700 /home/node/.npm /app/.pnpm-store

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace configuration and lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages/onsocial-js/package.json ./packages/onsocial-js/
COPY packages/app/package.json packages/app/tsconfig.json ./packages/app/

# Set ownership
RUN chown -R node:node /app

# Install dependencies without frozen lockfile
USER node
RUN pnpm install --store-dir=/app/.pnpm-store

# Copy the rest of the application code
COPY packages/app ./packages/app

# Build the package
RUN cd packages/app && pnpm build

# Update runtime stage to use ARG
FROM ${BASE_IMAGE}

# Install pnpm and expo-cli globally
RUN npm install -g npm@latest && \
    npm install -g pnpm@10.11.0 expo-cli

# Create directories with appropriate permissions
RUN mkdir -p /home/node/.npm /app/.pnpm-store && \
    chown node:node /home/node/.npm /app/.pnpm-store && \
    chmod 700 /home/node/.npm /app/.pnpm-store

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts and configuration
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/tsconfig.json ./
COPY --from=builder /app/packages/onsocial-js ./packages/onsocial-js
COPY --from=builder /app/packages/app ./packages/app

# Set ownership
RUN chown -R node:node /app

# Install dependencies without frozen lockfile
USER node
RUN pnpm install --store-dir=/app/.pnpm-store

CMD ["pnpm", "--dir", "packages/app", "start"]