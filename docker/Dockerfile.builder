# Stage 1: Fetch dependencies
FROM rust:1.86.0-slim-bookworm AS deps

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    clang \
    curl \
    git \
    pkg-config \
    libudev-dev \
    jq \
    libperl-dev \
    perl-modules-5.36 \
    libssl-dev \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js, near-cli, and near-sandbox
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g npm@11.3.0 \
    && npm install -g near-cli \
    && npm install -g near-sandbox \
    && rm -rf /var/lib/apt/lists/*

# Configure Rust environment
RUN rustup default 1.86.0 \
    && rustup target add wasm32-unknown-unknown \
    && rustc --version \
    && cargo --version

# Install additional Cargo tools
RUN cargo install cargo-tarpaulin \
    && rustup component add clippy \
    && cargo install cargo-audit \
    && cargo install cargo-tree \
    && rustup component add rustfmt

# Set up Rust environment
ENV CARGO_HOME=/usr/local/cargo
ENV PATH="$CARGO_HOME/bin:$PATH"

# Create working directory
WORKDIR /code

# Copy workspace Cargo.toml and Cargo.lock
COPY Cargo.toml Cargo.lock ./

# Copy contract Cargo.toml files and create dummy src/lib.rs
COPY contracts contracts
RUN find contracts -type f -name Cargo.toml | while read -r toml; do \
        dir=$(dirname "$toml"); \
        mkdir -p "$dir/src" && echo "fn main() {}" > "$dir/src/lib.rs"; \
    done

# Copy tests Cargo.toml
COPY tests/Cargo.toml tests/
RUN mkdir -p tests/src && echo "fn main() {}" > tests/src/lib.rs

# Fetch dependencies
RUN cargo fetch

# Stage 2: Build contracts
FROM rust:1.86.0-slim-bookworm AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    clang \
    curl \
    git \
    pkg-config \
    libudev-dev \
    jq \
    libperl-dev \
    perl-modules-5.36 \
    libssl-dev \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js, near-cli, and near-sandbox
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g npm@11.3.0 \
    && npm install -g near-cli \
    && npm install -g near-sandbox \
    && rm -rf /var/lib/apt/lists/*

# Copy cached Rust dependencies
COPY --from=deps /usr/local/cargo /usr/local/cargo
COPY --from=deps /usr/local/rustup /usr/local/rustup

# Set up Rust environment
ENV CARGO_HOME=/usr/local/cargo
ENV PATH="$CARGO_HOME/bin:$PATH"

# Create working directory
WORKDIR /code

# Copy all source code
COPY . .

# Install cargo-near
RUN cargo install cargo-near --version 0.14.1 \
    && chmod +x scripts/*.sh

# Test build one contract to verify setup
WORKDIR /code/contracts/auth-onsocial
RUN cargo near build non-reproducible-wasm
WORKDIR /code

# Set up environment
ENV NEAR_ENV=sandbox
ENV NEAR_NODE_URL=http://localhost:3030