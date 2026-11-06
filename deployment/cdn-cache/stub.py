#!/usr/bin/env python3
"""Stub upstream for the CDN cache proof.

Speaks plain HTTP on 8080 (resize service and the counter) and TLS on 443
(content gateway). Every response pretends it was already a cache hit and
asks to be stored, including errors, so the test can prove those headers
are not what decides what this edge stores.
"""

import json
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

COUNTS = {}
LOCK = threading.Lock()

ERRORS = {
    "missing": 404,
    "payment": 402,
    "forbidden": 403,
    "gateway-timeout": 504,
    "gwtimeout": 504,
    "upstream-error": 500,
}


def cid_from_path(path):
    parts = [part for part in path.split("?", 1)[0].split("/") if part]
    if "ipfs" not in parts:
        return ""
    index = parts.index("ipfs")
    if index + 1 >= len(parts):
        return ""
    return parts[index + 1]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self._respond(write_body=True)

    def do_HEAD(self):
        self._respond(write_body=False)

    def _respond(self, write_body):
        path = self.path.split("?", 1)[0]
        if path == "/counts":
            with LOCK:
                payload = json.dumps(COUNTS).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        with LOCK:
            COUNTS[path] = COUNTS.get(path, 0) + 1
            seen = COUNTS[path]

        status = ERRORS.get(cid_from_path(path), 200)
        upstream = self.headers.get("X-Cdn-Upstream", "-")
        cache_key = self.headers.get("X-Cache-Key", "-")
        host = self.headers.get("Host", "-")
        body = f"{status}|{seen}|up={upstream}|key={cache_key}|host={host}|path={path}".encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Cache", "HIT")
        self.send_header("Cache-Control", "public, max-age=31536000")
        self.send_header("Access-Control-Allow-Origin", "https://upstream.example")
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Vary", "Accept")
        self.end_headers()
        if write_body:
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        print("%s %s" % (self.command, self.path), flush=True)


def serve(httpd):
    httpd.serve_forever()


def main():
    plain = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain("/certs/stub.crt", "/certs/stub.key")
    secure = ThreadingHTTPServer(("0.0.0.0", 443), Handler)
    secure.socket = context.wrap_socket(secure.socket, server_side=True)
    threading.Thread(target=serve, args=(plain,), daemon=True).start()
    serve(secure)


if __name__ == "__main__":
    main()
