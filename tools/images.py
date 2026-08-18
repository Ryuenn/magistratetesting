#!/usr/bin/env python3
"""Convert referenced site images to WebP without visible quality loss.

Rules this follows, in order of importance:
  * Never resize. Every output keeps the source's exact pixel dimensions, so no
    layout can shift and no detail is thrown away.
  * Never ship a version that looks worse. Each candidate is scored against the
    original with SSIM and quality is raised until it clears the threshold; if
    lossy can't clear it, lossless is used.
  * Never ship a version that isn't meaningfully smaller. Below the savings
    floor the original is kept and the page keeps pointing at it.
  * Originals are left on disk untouched.

    python tools/images.py --dry-run    # report only
    python tools/images.py              # write .webp next to each source
"""

import argparse
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SSIM_FLOOR = 0.990   # below this the conversion is considered visibly different
MIN_SAVING = 0.10    # keep the original unless WebP is at least 10% smaller
QUALITY_LADDER = [88, 92, 95, 98]
CONVERTIBLE = (".png", ".jpg", ".jpeg")


def referenced_images():
    """Every raster image the pages point at, from HTML and from the stylesheet."""
    found = set()
    for name in os.listdir(ROOT):
        if not name.endswith(".html"):
            continue
        src = open(os.path.join(ROOT, name), encoding="utf-8").read()
        found |= set(re.findall(r'(?:src|href|content)="(assets/[^"]+)"', src))
        for group in re.findall(r'srcset="([^"]+)"', src):
            for part in group.split(","):
                found.add(part.strip().split()[0])
        for part in re.findall(r'url\((assets/[^)]+)\)', src):
            found.add(part.strip("'\""))

    # CSS backgrounds are LCP candidates too. The stylesheet sits at
    # assets/css/style.css and writes urls relative to itself ("../images/x.png"),
    # so resolve those back to a path from the project root.
    css = os.path.join(ROOT, "assets", "css", "style.css")
    if os.path.isfile(css):
        for part in re.findall(r'url\(["\']?([^)"\']+)', open(css, encoding="utf-8").read()):
            part = part.split("?")[0].strip()
            if part.startswith("../"):
                part = "assets/" + part[3:]
            part = part.lstrip("/")
            if part.startswith("assets/"):
                found.add(part)

    return sorted(
        p for p in found
        if p.lower().endswith(CONVERTIBLE) and os.path.isfile(os.path.join(ROOT, p))
    )


def to_array(im):
    """Flatten onto a mid grey so alpha differences still register in the score."""
    im = im.convert("RGBA")
    bg = Image.new("RGBA", im.size, (128, 128, 128, 255))
    return np.asarray(Image.alpha_composite(bg, im).convert("L"), dtype=np.float64)


def ssim(a, b):
    """Global SSIM over 8x8 blocks - enough to catch banding and blocking."""
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    h, w = a.shape
    h, w = h - h % 8, w - w % 8
    a, b = a[:h, :w], b[:h, :w]
    av = a.reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 64)
    bv = b.reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 64)
    ma, mb = av.mean(1), bv.mean(1)
    va, vb = av.var(1), bv.var(1)
    cov = ((av - ma[:, None]) * (bv - mb[:, None])).mean(1)
    s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma ** 2 + mb ** 2 + C1) * (va + vb + C2))
    return float(s.mean())


def encode(im, path, **kw):
    im.save(path, "WEBP", method=6, **kw)
    return os.path.getsize(path)


def convert(rel, dry_run):
    src = os.path.join(ROOT, rel)
    dst = os.path.splitext(src)[0] + ".webp"
    original = Image.open(src)
    has_alpha = original.mode in ("RGBA", "LA") or "transparency" in original.info
    im = original.convert("RGBA" if has_alpha else "RGB")
    ref = to_array(original)
    before = os.path.getsize(src)

    tmp = dst + ".tmp"
    best = None
    for q in QUALITY_LADDER:
        size = encode(im, tmp, quality=q)
        score = ssim(ref, to_array(Image.open(tmp)))
        if score >= SSIM_FLOOR:
            best = ("q%d" % q, size, score)
            break
    if best is None:
        size = encode(im, tmp, lossless=True)
        best = ("lossless", size, 1.0)

    # Lossless sometimes beats a high-quality lossy pass on flat/palette art.
    if best[0] != "lossless":
        lossless_tmp = dst + ".ll.tmp"
        ll = encode(im, lossless_tmp, lossless=True)
        if ll < best[1]:
            os.replace(lossless_tmp, tmp)
            best = ("lossless", ll, 1.0)
        else:
            os.remove(lossless_tmp)

    mode, after, score = best
    saving = 1 - after / before
    keep = saving >= MIN_SAVING

    if dry_run or not keep:
        os.remove(tmp)
    else:
        os.replace(tmp, dst)

    return {
        "src": rel, "before": before, "after": after, "saving": saving,
        "mode": mode, "ssim": score, "kept": keep,
        "dims": original.size, "alpha": has_alpha,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    args = ap.parse_args()

    images = referenced_images()
    print("%-38s %9s %9s %7s %9s %6s" % ("image", "before", "after", "saved", "encoding", "ssim"))
    total_before = total_after = 0
    skipped = []
    for rel in images:
        r = convert(rel, args.dry_run)
        total_before += r["before"]
        total_after += r["after"] if r["kept"] else r["before"]
        if not r["kept"]:
            skipped.append(r)
            continue
        print("%-38s %8.1fK %8.1fK %6.0f%% %9s %6.4f"
              % (r["src"], r["before"] / 1024, r["after"] / 1024,
                 100 * r["saving"], r["mode"], r["ssim"]))

    for r in skipped:
        print("%-38s %8.1fK %8s   kept original (only %.0f%% smaller)"
              % (r["src"], r["before"] / 1024, "-", 100 * r["saving"]))

    print("\n  %d images: %.2f MB -> %.2f MB  (%.0f%% smaller, %.2f MB saved)"
          % (len(images), total_before / 1048576, total_after / 1048576,
             100 * (1 - total_after / total_before),
             (total_before - total_after) / 1048576))
    if args.dry_run:
        print("  dry run - nothing written")


if __name__ == "__main__":
    sys.exit(main())
