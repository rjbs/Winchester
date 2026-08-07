#!/usr/bin/env python3
"""Serve this directory for local play, with caching turned off.

The stock `python3 -m http.server` sends Last-Modified and nothing else, so a
browser is entitled to reuse a cached copy without asking.  For ES modules that
is worse than it sounds: a stale module whose exports have since changed makes
the import fail at link time, so nothing runs at all and you get a blank page
rather than an error.  One afternoon of that is plenty.
"""

import http.server
import socket
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


def lan_address():
    """This machine's address on the local network, for playing on a phone."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(('192.0.2.1', 1))  # reserved, and UDP connect sends nothing
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

    # Not every Python knows this one, and a module served as octet-stream is
    # refused outright.
    NoCache.extensions_map['.mjs'] = 'text/javascript'

    server = http.server.ThreadingHTTPServer(('', port), NoCache)

    print(f'  http://localhost:{port}/')
    if lan := lan_address():
        print(f'  http://{lan}:{port}/   (for the phone)')
    print('control-C to stop')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
