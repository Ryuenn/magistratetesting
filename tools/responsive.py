#!/usr/bin/env python3
"""Generate responsive image variants sized to how the pages actually render.

The widths in MEASURED are measured, not inferred from the stylesheet.
tools/measure.js drives a headless Chromium over the local preview at a 412px
and a 1440px viewport and records each image's real rendered box. Reading
max-width out of the CSS gets this badly wrong: containers nest and grids
subdivide, so an element inside a 1152px container may only ever paint 502px.

Two numbers drive everything:

  * `sizes` tells the browser how wide the image will actually be, so it can
    pick the right file. Mobile is expressed as a vw fraction of the 412px
    test viewport - claiming 100vw for an image that paints 248px makes the
    browser fetch roughly four times the bytes it needs.
  * The cap is the widest file worth storing: mobile width x 2.625 (the device
    pixel ratio Lighthouse emulates) or desktop width x 2, whichever is larger.
    Beyond that the extra pixels can never reach a screen.

    python tools/responsive.py --dry-run
    python tools/responsive.py

MEASURED is regenerated with tools/measure.js against the dev server.
"""

import argparse
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MOBILE_VIEWPORT = 412
DESKTOP_VIEWPORT = 1440
MOBILE_DPR = 2.625
DESKTOP_DPR = 2
LADDER = [160, 200, 260, 320, 400, 440, 480, 520, 560, 600, 640, 720, 800,
          880, 960, 1120, 1280, 1440, 1600, 1920]
# Finer steps cost a few extra files but let the browser land close to the exact
# width it needs. At 1.18 the gap from 480 to 640 forced a 640w download for a
# 493px slot.
MIN_STEP = 1.08

# class -> (rendered px at 412 viewport, rendered px at 1440 viewport)
MEASURED = {
    "hero__person": (438, 1374),
    "home-discover__img": (398, 625),
    "preview-hero__person": (244, 616),
    "preview-lessons__featured-img": (348, 420),
    "course-product-card__thumbnail": (322, 413),
    "home-prepared__img": (280, 400),
    "footer__logo-img": (127, 260),
    "home-cta__underline-img": (150, 260),
    "page-loader__logo": (220, 220),
    "about-instructor__headshot": (130, 210),
    "header__logo-img": (106, 169),
}
FALLBACK = (412, 1440)  # unknown class: assume full bleed rather than under-serve


def first_class(tag):
    m = re.search(r'class="([^"]+)"', tag)
    return m.group(1).split()[0] if m else None


def geometry(cls):
    mob, desk = MEASURED.get(cls, FALLBACK)
    cap = int(max(mob * MOBILE_DPR, desk * DESKTOP_DPR))
    if desk >= DESKTOP_VIEWPORT:
        sizes = "100vw"
    else:
        vw = min(100, round(mob / MOBILE_VIEWPORT * 100))
        sizes = "(max-width: 767px) %dvw, %dpx" % (vw, desk)
    return cap, sizes


def rungs(cap, natural):
    """Ladder of widths to offer, from smallest to the cap.

    Each rung must be at least MIN_STEP wider than the last one KEPT - comparing
    against the last kept value rather than overwriting it matters, because
    overwriting cascades: 560 collapses into 640, which collapses into 720, and
    the whole middle of the ladder disappears. That left an 848w file as the
    smallest option above 400w, so a phone needing ~540px downloaded 848px.
    """
    limit = min(cap, natural)
    keep = []
    for w in [w for w in LADDER if w < limit]:
        if not keep or w >= keep[-1] * MIN_STEP:
            keep.append(w)
    # The cap itself always ships; fold it into the last rung if they are close.
    if not keep or limit >= keep[-1] * 1.08:
        keep.append(limit)
    else:
        keep[-1] = limit
    return keep


def encode(src_path, width, out_path):
    with Image.open(src_path) as im:
        alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
        im = im.convert("RGBA" if alpha else "RGB")
        if im.size[0] != width:
            im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
        im.save(out_path, "WEBP", quality=88, method=6)
    return os.path.getsize(out_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    # widest cap any usage of a given file needs
    need = {}
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith(".html"):
            continue
        page = open(os.path.join(ROOT, name), encoding="utf-8").read()
        for tag in re.findall(r"<img\b[^>]*>", page):
            m = re.search(r'src="([^"]+)"', tag)
            if not m:
                continue
            ref = m.group(1)
            if not ref.startswith("assets/") or ref.endswith(".svg"):
                continue
            if not os.path.isfile(os.path.join(ROOT, ref)):
                continue
            cap, _ = geometry(first_class(tag))
            need[ref] = max(need.get(ref, 0), cap)

    built, before_t, after_t = {}, 0, 0
    print("%-34s %8s %6s  %s" % ("image", "stored", "cap", "variants"))
    for ref, cap in sorted(need.items()):
        full = os.path.join(ROOT, ref)
        with Image.open(full) as im:
            natural = im.size[0]
        widths = rungs(cap, natural)
        # A single rung is still worth building when it is narrower than the
        # source - that is the avatar case, a 1000px portrait painted at 70px.
        # Only skip when the ladder offers nothing below the natural width.
        if widths == [natural]:
            continue
        made = []
        for w in widths:
            out = "%s-%dw.webp" % (os.path.splitext(ref)[0], w)
            outp = os.path.join(ROOT, out)
            n = encode(full, w, outp)
            if args.dry_run:
                os.remove(outp)
            made.append((w, out, n))

        # Drop rungs that are not smaller than a wider one - re-encoding a
        # near-lossless source can make 960w heavier than 1000w, and picking
        # the narrower file would cost more bytes for less detail.
        pruned, best = [], None
        for w, out, n in reversed(made):
            if best is None or n < best:
                pruned.append((w, out, n))
                best = n
            elif not args.dry_run:
                os.remove(os.path.join(ROOT, out))
        made = list(reversed(pruned))

        built[ref] = made
        before_t += os.path.getsize(full)
        after_t += made[-1][2]
        print("%-34s %7.0fK %6d  %s"
              % (ref, os.path.getsize(full) / 1024, cap,
                 " ".join("%d:%.0fK" % (w, n / 1024) for w, _, n in made)))

    print("\n  largest variant total: %.2f MB -> %.2f MB"
          % (before_t / 1048576, after_t / 1048576))
    if args.dry_run:
        print("  dry run - nothing written")
        return 0

    changed = 0
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith(".html"):
            continue
        p = os.path.join(ROOT, name)
        page = open(p, encoding="utf-8").read()
        original = page

        def rewrite(tag):
            m = re.search(r'src="([^"]+)"', tag)
            if not m:
                return tag
            ref = m.group(1)
            if not ref.startswith("assets/") or ref.endswith(".svg"):
                return tag
            _, sizes = geometry(first_class(tag))
            made = built.get(ref)
            pick = made[-1][1] if made else ref
            with Image.open(os.path.join(ROOT, pick)) as im:
                w, h = im.size
            tag = re.sub(r'src="[^"]+"', 'src="%s"' % pick, tag)
            tag = re.sub(r'\s*(?:srcset|sizes)="[^"]*"', "", tag)
            if re.search(r'\bwidth="\d+"', tag):
                tag = re.sub(r'\bwidth="\d+"', 'width="%d"' % w, tag)
            if re.search(r'\bheight="\d+"', tag):
                tag = re.sub(r'\bheight="\d+"', 'height="%d"' % h, tag)
            if not made or len(made) < 2:
                return tag
            srcset = ", ".join("%s %dw" % (out, ww) for ww, out, _ in made)
            close = " />" if tag.rstrip().endswith("/>") else ">"
            body = tag.rstrip()[:-len(close.strip())].rstrip()
            return '%s srcset="%s" sizes="%s"%s' % (body, srcset, sizes, close)

        page = re.sub(r"<img\b[^>]*>", lambda m: rewrite(m.group(0)), page)
        if page != original:
            open(p, "w", encoding="utf-8").write(page)
            changed += 1
    print("  pages rewritten: %d" % changed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
