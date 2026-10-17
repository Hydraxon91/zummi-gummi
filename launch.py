#!/usr/bin/env python3
"""
Gummy Bears launcher.

Serves this folder over HTTP and opens the app in your browser.
Works on macOS, Windows and Linux with Python 3 (no extra packages).

By default it listens on all interfaces so other devices on the same network
can open the printed Network URL. Use --localhost to restrict it to this
machine only.

    python3 launch.py                # localhost + LAN
    python3 launch.py --localhost    # this machine only
    python3 launch.py --port 8080
    python3 launch.py --no-open
    python3 launch.py --install-shortcut   # Linux app-menu shortcut
"""

from __future__ import annotations

import argparse
import errno
import http.server
import os
import socket
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8000

EXTRA_TYPES = {
    ".wasm": "application/wasm",
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
}

REQUIRED = (
    Path("index.html"),
    Path("src/app.js"),
    Path("src/config.js"),
    Path("src/box3d.js"),
    Path("vendor/box3d/box3d.js"),
    Path("vendor/box3d/box3d.wasm"),
)


class GummyHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler with correct wasm MIME type and no caching."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        **EXTRA_TYPES,
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):
        if getattr(self.server, "verbose", False):
            super().log_message(fmt, *args)


class GummyServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def lan_ips():
    """Best-effort list of non-loopback IPv4 addresses for this machine."""
    found = set()

    # The UDP connect trick finds the interface used for the default route
    # without sending any packets.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith(("127.", "169.254.")):
                found.add(ip)
    except OSError:
        pass

    try:
        for info in socket.getaddrinfo(
            socket.gethostname(), None, socket.AF_INET, socket.SOCK_STREAM
        ):
            ip = info[4][0]
            if ip and not ip.startswith(("127.", "169.254.")):
                found.add(ip)
    except OSError:
        pass

    return sorted(found)


def pick_port(host, preferred, attempts=30):
    """Return a free TCP port, starting at *preferred*."""
    for port in range(preferred, preferred + attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((host, port))
                return port
        except OSError:
            continue

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def check_install():
    missing = [str(p) for p in REQUIRED if not (ROOT / p).is_file()]
    if missing:
        print("This launcher needs the complete Gummy Bears folder.", file=sys.stderr)
        print("Missing:", ", ".join(missing), file=sys.stderr)
        print("Keep launch.py next to index.html, src/ and vendor/.", file=sys.stderr)
        return False
    return True


def install_shortcut(port):
    """Linux convenience: add a desktop-entry launcher (app menu + Desktop)."""
    if not sys.platform.startswith("linux"):
        if sys.platform == "darwin":
            print('On macOS just double-click "Launch Gummy Bears.command".')
        elif sys.platform.startswith("win"):
            print('On Windows just double-click "Launch Gummy Bears.bat".')
        return

    desktop_entry = (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=Gummy Bears\n"
        "Comment=Soft-body gummy bear playground\n"
        f'Exec="{sys.executable}" "{ROOT / "launch.py"}" --port {port}\n'
        f"Path={ROOT}\n"
        "Icon=applications-games\n"
        "Terminal=true\n"
        "Categories=Game;\n"
        "StartupNotify=true\n"
    )

    apps_dir = Path.home() / ".local/share/applications"
    apps_dir.mkdir(parents=True, exist_ok=True)
    entry = apps_dir / "gummy-bears.desktop"
    entry.write_text(desktop_entry, encoding="utf-8")
    entry.chmod(0o755)
    print(f"Installed application shortcut: {entry}")

    desktop = Path.home() / "Desktop"
    if desktop.is_dir():
        copy = desktop / "Gummy Bears.desktop"
        copy.write_text(desktop_entry, encoding="utf-8")
        copy.chmod(0o755)
        print(f"Copied shortcut to:           {copy}")
        print("If your desktop asks, right-click it and choose 'Allow launching'.")
    print("")


def main():
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="Serve and open Gummy Bears.")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("GUMMY_PORT", DEFAULT_PORT)),
        help=f"preferred TCP port (default {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--localhost",
        action="store_true",
        help="only accept connections from this machine (127.0.0.1)",
    )
    parser.add_argument(
        "--no-open", action="store_true", help="do not open a browser window"
    )
    parser.add_argument(
        "--install-shortcut",
        action="store_true",
        help="Linux: install an application-menu / desktop shortcut",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="log every HTTP request"
    )
    args = parser.parse_args()

    if not check_install():
        return 1

    host = "127.0.0.1" if args.localhost else "0.0.0.0"
    port = pick_port(host, args.port)
    handler = partial(GummyHandler, directory=str(ROOT))

    try:
        httpd = GummyServer((host, port), handler)
    except OSError as exc:
        print(f"Could not start the web server: {exc}", file=sys.stderr)
        return 1

    httpd.verbose = args.verbose
    local_url = f"http://localhost:{port}/"
    network_urls = [] if args.localhost else [
        f"http://{ip}:{port}/" for ip in lan_ips()
    ]

    line = "=" * 62
    print(line)
    print("  GUMMY BEARS")
    print(line)
    print(f"  This computer :  {local_url}")
    if args.localhost:
        print("  Other devices :  off  (started with --localhost)")
    elif network_urls:
        for url in network_urls:
            print(f"  Other devices :  {url}")
        print("                   (same Wi-Fi / LAN, no VPN required)")
    else:
        print("  Other devices :  no network address found")
    print(f"  Serving       :  {ROOT}")
    print(line)
    print("  Keep this window open while you play.")
    print("  Press Ctrl+C to stop the server.")
    print("")

    if args.install_shortcut:
        install_shortcut(port)

    if not args.no_open:
        threading.Timer(0.35, lambda: webbrowser.open(local_url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Gummy Bears. Bye!")
    except OSError as exc:
        # A closed browser connection should never take the server down.
        if exc.errno not in (errno.EPIPE, errno.ECONNRESET):
            raise
    finally:
        httpd.shutdown()
        httpd.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
