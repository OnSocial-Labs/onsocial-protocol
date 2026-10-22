#!/usr/bin/env python3
"""Publish the node RPC on the Docker bridge and nowhere else.

The SSH reverse tunnel lands on 127.0.0.1. Containers cannot reach that
address, and binding 0.0.0.0 would expose the node on the public NIC.
"""

from __future__ import annotations

import socket
import sys
import threading


def pipe(src: socket.socket, dst: socket.socket) -> None:
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        for sock, how in (
            (src, socket.SHUT_RD),
            (dst, socket.SHUT_WR),
        ):
            try:
                sock.shutdown(how)
            except OSError:
                pass


def handle(client: socket.socket, target: tuple[str, int]) -> None:
    try:
        upstream = socket.create_connection(target, timeout=5)
    except OSError:
        client.close()
        return
    left = threading.Thread(target=pipe, args=(client, upstream), daemon=True)
    right = threading.Thread(target=pipe, args=(upstream, client), daemon=True)
    left.start()
    right.start()
    left.join()
    right.join()
    client.close()
    upstream.close()


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: onsocial-rpc-bridge BIND_HOST BIND_PORT TARGET_HOST TARGET_PORT"
        )
    bind_host = sys.argv[1]
    bind_port = int(sys.argv[2])
    target = (sys.argv[3], int(sys.argv[4]))
    if bind_host in ("0.0.0.0", "::", ""):
        raise SystemExit("refusing to bind a public address")

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((bind_host, bind_port))
    server.listen(64)
    while True:
        client, _addr = server.accept()
        threading.Thread(
            target=handle, args=(client, target), daemon=True
        ).start()


if __name__ == "__main__":
    main()
