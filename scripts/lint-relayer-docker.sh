#!/bin/bash
# Lint the relayer package using the Docker builder stage
set -e

docker build -f docker/Dockerfile.relayer -t relayer-builder --target builder .
docker run --rm -v "$PWD":/code -w /code/packages/relayer relayer-builder cargo clippy --all-targets --all-features -- -D warnings
