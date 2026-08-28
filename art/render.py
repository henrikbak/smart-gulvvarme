#!/usr/bin/env python3
"""Rasterise an SVG file to PNG at an exact pixel size using headless Chromium.

    python3 art/render.py art/app.svg assets/images/large.png 500 350

Set CHROME to a headless-capable Chromium binary if the default is not present.
Note that the full `chrome` binary short-changes the viewport by the height of
the (absent) browser chrome, which silently leaves a white band at the bottom of
the shot; `headless_shell` renders the page full-bleed.
"""
import os, subprocess, sys, tempfile

CHROME = os.environ.get(
    "CHROME", "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"
)

def render(svg_path, png_path, w, h):
    svg = open(svg_path, encoding="utf-8").read()
    html = (
        '<!doctype html><html><head><meta charset="utf-8"><style>'
        'html,body{margin:0;padding:0;overflow:hidden;background:#fff}'
        f'svg{{display:block;width:{w}px;height:{h}px}}'
        '</style></head><body>' + svg + '</body></html>'
    )
    d = os.path.dirname(os.path.abspath(png_path)) or "."
    os.makedirs(d, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(html)
        tmp = f.name
    try:
        subprocess.run([
            CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
            "--force-device-scale-factor=1", f"--screenshot={png_path}",
            f"--window-size={w},{h}", tmp,
        ], check=True, capture_output=True)
    finally:
        os.unlink(tmp)
    print(f"{png_path}  {w}x{h}")

if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
