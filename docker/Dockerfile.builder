# Update the default ARG to use a valid base image reference
ARG BASE_IMAGE=debian:bookworm-slim
FROM ${BASE_IMAGE} AS builder

# Install system dependencies, Node.js, and Rust in one layer
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    build-essential \
    clang \
    curl \
    git \
    pkg-config \
    libudev-dev \
    jq \
    libssl-dev \
    nodejs \
    npm \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g npm@latest near-cli near-sandbox \
    && curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain 1.86 \
    && . "$HOME/.cargo/env" \
    && rustup target add wasm32-unknown-unknown \
    && rustup component add rustfmt clippy \
    && cargo install cargo-tarpaulin cargo-edit cargo-audit cargo-tree cargo-near cargo-nextest \
    && rustc --version \
    && cargo --version \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set environment variables
ENV CARGO_HOME=/root/.cargo
ENV PATH="$CARGO_HOME/bin:$PATH"
ENV NEAR_ENV=sandbox
ENV NEAR_NODE_URL=http://localhost:3030

# Create working directory
WORKDIR /code

# Copy dependency files first to cache dependency fetching
COPY Cargo.toml Cargo.lock ./
COPY contracts contracts
COPY tests/Cargo.toml tests/

# Create dummy source files for dependency fetching
RUN find contracts -type f -name Cargo.toml | while read -r toml; do \
        dir=$(dirname "$toml"); \
        mkdir -p "$dir/src" && echo "fn main() {}" > "$dir/src/lib.rs"; \
    done \
    && mkdir -p tests/src && echo "fn main() {}" > tests/src/lib.rs \
    && cargo fetch \
    && rm -rf contracts/*/src tests/src

# Copy all source code
COPY . .

# Ensure scripts are executable
RUN chmod +x scripts/*.sh