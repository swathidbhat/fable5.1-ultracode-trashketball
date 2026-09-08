#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file (three.js still loads from the jsdelivr importmap).

Usage: python3 tools/build-single.py [--fragment PATH]
  writes dist/trashketball.html (a complete page) and, with --fragment, a body-only fragment for hosts
  that wrap the content in their own <html>/<head>/<body> skeleton.
Requires node/npx (esbuild is fetched on demand).
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ESBUILD = 'esbuild@0.24.2'


def bundle_js() -> str:
    out = ROOT / 'dist' / 'game.bundle.js'
    out.parent.mkdir(exist_ok=True)
    cmd = ['npx', '--yes', ESBUILD, str(ROOT / 'src' / 'main.js'), '--bundle', '--format=esm',
           '--external:three', '--external:three/addons/*', '--minify-syntax', '--log-level=warning',
           f'--outfile={out}']
    subprocess.run(cmd, check=True, cwd=ROOT)
    js = out.read_text()
    out.unlink()
    return js.replace('</script', '<\\/script')


def main():
    fragment = None
    if '--fragment' in sys.argv:
        fragment = Path(sys.argv[sys.argv.index('--fragment') + 1])
    index = (ROOT / 'index.html').read_text()
    head_bits = re.search(r'<head>(.*?)</head>', index, re.S).group(1)
    style = re.search(r'<style>(.*?)</style>', head_bits, re.S).group(1)
    importmap = re.search(r'<script type="importmap">(.*?)</script>', head_bits, re.S).group(1)
    fonts = re.search(r'<link rel="stylesheet" href="([^"]+)">', head_bits).group(1)
    js = bundle_js()

    body = f'''<title>Trashketball</title>
<link rel="stylesheet" href="{fonts}">
<style>{style}</style>
<script type="importmap">{importmap}</script>
<canvas id="game"></canvas>
<div id="hud"></div>
<script type="module">
{js}
</script>
'''
    full = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0a1e33">
</head>
<body>
{body}</body>
</html>
'''
    dist = ROOT / 'dist' / 'trashketball.html'
    dist.write_text(full)
    print(f'wrote {dist} ({dist.stat().st_size // 1024} KB)')
    if fragment:
        fragment.write_text(body)
        print(f'wrote {fragment} ({fragment.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
