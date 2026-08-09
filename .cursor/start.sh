#!/usr/bin/env bash
# Per-boot: nested Docker daemon for validate_sql / check:push.
set -euo pipefail

docker_ok() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  if sg docker -c "docker info" >/dev/null 2>&1; then
    return 0
  fi
  if sudo docker info >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed in this environment" >&2
  exit 1
fi

if ! docker_ok; then
  if command -v service >/dev/null 2>&1; then
    sudo service docker start >/dev/null 2>&1 || true
  fi
  if ! docker_ok; then
    sudo dockerd >/tmp/dockerd.log 2>&1 &
  fi
  i=0
  while [ "$i" -lt 30 ]; do
    if docker_ok; then
      break
    fi
    i=$((i + 1))
    sleep 1
  done
fi

if ! docker_ok; then
  echo "error: docker daemon failed to start" >&2
  exit 1
fi

driver=unknown
if driver_out="$(docker info --format '{{.Driver}}' 2>/dev/null)"; then
  driver="$driver_out"
elif driver_out="$(sg docker -c "docker info --format '{{.Driver}}'" 2>/dev/null)"; then
  driver="$driver_out"
elif driver_out="$(sudo docker info --format '{{.Driver}}' 2>/dev/null)"; then
  driver="$driver_out"
fi

echo "Docker ready (${driver} storage)"
