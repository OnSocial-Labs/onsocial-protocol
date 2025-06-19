# Add ARG for base image with default value
ARG BASE_IMAGE=node:slim
FROM ${BASE_IMAGE} AS builder

# Install pnpm and npm-check-updates globally (no npm upgrade)
RUN npm install -g pnpm@latest npm-check-updates@latest

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
COPY packages/onsocial-js/package.json packages/onsocial-js/tsconfig.json ./packages/onsocial-js/

# Set ownership
RUN chown -R node:node /app

# Install dependencies without frozen lockfile to handle potential mismatches
USER node
RUN pnpm install --store-dir=/app/.pnpm-store

# Copy the rest of the application code
COPY packages/onsocial-js ./packages/onsocial-js

# Switch to root to ensure chown works
USER root
RUN chown -R node:node /app/packages/onsocial-js

# Switch back to node for build
USER node
RUN cd packages/onsocial-js && pnpm build

# Update runtime stage to use ARG
FROM ${BASE_IMAGE}

# Install pnpm globally (no npm upgrade)
RUN npm install -g pnpm@latest

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

# Set ownership
RUN chown -R node:node /app

# Install dependencies without frozen lockfile
USER node
RUN pnpm install --store-dir=/app/.pnpm-store

CMD ["pnpm", "--dir", "packages/onsocial-js", "start"]
