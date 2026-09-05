#!/usr/bin/env python3
"""Static dev server with caching disabled, so edited ES modules are always re-fetched.

Usage: python3 tools/serve.py [port]   (default 5173, binds 127.0.0.1)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console quiet except for errors.
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    root = Path(__file__).resolve().parent.parent
    handler = partial(NoCacheHandler, directory=str(root))
    server = ThreadingHTTPServer(('127.0.0.1', port), handler)
    print(f'Serving {root} at http://127.0.0.1:{port}/ (no-cache)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
