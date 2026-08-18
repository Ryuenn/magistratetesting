#!/usr/bin/env python3
"""Downscale CSS background images to the size they actually paint at.

A CSS background can't use srcset, so the one stored file has to serve every
place it appears - which means it should be exactly as wide as the largest of
those places needs, and no wider. The homepage was shipping twelve 1280px
episode thumbnails (~190KB each) into slots that never paint wider than 348 CSS
px; that is roughly 2MB of pixels no screen can show.

Widths come from tools/bgmeasure.js, which walks every page at a mobile and a
desktop viewport and records the widest rendered box for each background image,
multiplied by that viewport's device pixel ratio.

    node tools/bgmeasure.js        # writes bg-need.json (needs the dev server)
    python tools/backgrounds.py --dry-run
    python tools/backgrounds.py

Only the generated .webp is touched; the original PNG/JPG stays untouched as
the source of truth. Re-running tools/images.py regenerates these at full size,
so run this afterwards.
"""

import argparse
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "assets", "images")
NEED_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bg-need.json")
MIN_SAVING = 0.15   # leave it alone unless the resize wins at least 15%


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--need", default=NEED_FILE, help="json map of file -> required px")
    args = ap.parse_args()

    if not os.path.isfile(args.need):
        sys.exit("missing %s - run: node tools/bgmeasure.js (dev server must be up)" % args.need)
    need = json.load(open(args.need, encoding="utf-8"))

    before_total = after_total = 0
    print("%-32s %9s %9s %8s  %s" % ("background", "stored", "needed", "saving", "result"))
    for name, required in sorted(need.items()):
        path = os.path.join(IMAGES, name)
        if not os.path.isfile(path):
            continue
        before = os.path.getsize(path)
        with Image.open(path) as im:
            w, h = im.size
            alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
            if w <= required:
                before_total += before
                after_total += before
                continue
            target = int(required)
            resized = im.convert("RGBA" if alpha else "RGB").resize(
                (target, round(h * target / w)), Image.LANCZOS)

        tmp = path + ".tmp"
        resized.save(tmp, "WEBP", quality=88, method=6)
        after = os.path.getsize(tmp)
        saving = 1 - after / before
        if saving < MIN_SAVING:
            os.remove(tmp)
            before_total += before
            after_total += before
            print("%-32s %8.0fK %8dpx %7.0f%%  kept (not worth it)"
                  % (name, before / 1024, required, 100 * saving))
            continue

        if args.dry_run:
            os.remove(tmp)
        else:
            os.replace(tmp, path)
        before_total += before
        after_total += after
        print("%-32s %8.0fK %8dpx %7.0f%%  %dpx -> %dpx"
              % (name, before / 1024, required, 100 * saving, w, target))

    print("\n  backgrounds: %.2f MB -> %.2f MB  (%.2f MB saved)"
          % (before_total / 1048576, after_total / 1048576,
             (before_total - after_total) / 1048576))
    if args.dry_run:
        print("  dry run - nothing written")


if __name__ == "__main__":
    main()
