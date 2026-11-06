#!/bin/sh
# Prepare the cache directory, then run the image entrypoint (template render
# and the server). A later start skips the ownership walk so a full cache does
# not delay the process.
set -eu

mkdir -p /var/cache/cdn
owner="$(stat -c %u /var/cache/cdn)"
nginx_uid="$(id -u nginx)"
if [ "$owner" != "$nginx_uid" ]; then
    chown -R nginx:nginx /var/cache/cdn
fi

exec /docker-entrypoint.sh nginx -g 'daemon off;'
