#!/usr/bin/env python3
"""Regenerate the minified CSS/JS the pages actually load.

This repo has no bundler and no package.json on purpose, so minification is a
step you run rather than a build pipeline. esbuild is fetched by npx (cached
after the first run) and nothing is installed into the project.

    python tools/minify.py            # rebuild css/style.min.css + js/script.min.js
    python tools/minify.py --check    # exit 1 if a .min file is stale (no writes)

Sources stay readable and are still what you edit. Source maps are emitted, so
DevTools shows the original files even though the page loads the minified ones.
"""

import argparse
import gzip
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESBUILD = "esbuild@0.25.0"

# (source, minified output)
TARGETS = [
    ("assets/css/style.css", "assets/css/style.min.css"),
]


def npx():
    exe = shutil.which("npx") or shutil.which("npx.cmd")
    if not exe:
        sys.exit("npx not found - install Node.js, or skip minification.")
    return exe


def stale(src, out):
    """True when the minified file is missing or older than its source."""
    s, o = os.path.join(ROOT, src), os.path.join(ROOT, out)
    if not os.path.isfile(o):
        return True
    return os.path.getmtime(s) > os.path.getmtime(o)


def sizes(path):
    data = open(os.path.join(ROOT, path), "rb").read()
    return len(data), len(gzip.compress(data, 9))


def build(src, out):
    subprocess.run(
        [npx(), "--yes", ESBUILD, src, "--minify", "--sourcemap",
         "--outfile=" + out, "--log-level=warning"],
        cwd=ROOT, check=True, shell=False,
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="report stale output and exit 1, without writing")
    args = ap.parse_args()

    outdated = [(s, o) for s, o in TARGETS if stale(s, o)]

    if args.check:
        if outdated:
            for s, o in outdated:
                print("STALE  %s is newer than %s" % (s, o))
            print("\nRun: python tools/minify.py")
            return 1
        print("Minified assets are up to date.")
        return 0

    if not outdated:
        print("Already up to date. Nothing to do.")
        return 0

    print("%-22s %12s %12s %10s" % ("", "raw", "gzip", "saved"))
    for src, out in TARGETS:
        before_raw, before_gz = sizes(src)
        build(src, out)
        after_raw, after_gz = sizes(out)
        print("%-22s %7d ->%5d %7d ->%5d %8.0f%%"
              % (os.path.basename(src), before_raw, after_raw,
                 before_gz, after_gz, 100 * (1 - after_gz / before_gz)))
    print("\nPages load the .min files; edit the originals and re-run this.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
