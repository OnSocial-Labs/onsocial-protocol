FROM rust:1.80-slim-buster

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js, near-cli, and near-sandbox
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g near-cli near-sandbox

# Install cargo-near
RUN cargo install cargo-near --version 0.13.6

# Set up Rust environment
ENV RUSTUP_HOME=/root/.rustup
ENV CARGO_HOME=/root/.cargo
ENV PATH="$CARGO_HOME/bin:$PATH"

# Create working directory
WORKDIR /code

# Copy project files
COPY . .

# Ensure scripts are executable
RUN chmod +x scripts/*.sh