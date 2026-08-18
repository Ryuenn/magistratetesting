// Measure the rendered width of every element that paints a CSS background
// image, across every page and at both viewports. CSS backgrounds can't use
// srcset, so the stored file has to be sized for the largest place it appears.
const { chromium } = require("playwright");
const fs = require("fs");

const ROOT = "c:/Projects/MagistrateTesting";
const PAGES = fs.readdirSync(ROOT)
  .filter(f => f.endsWith(".html"))
  .map(f => "/" + (f === "index.html" ? "" : f.replace(/\.html$/, "")));

const PROFILES = [
  { w: 412, h: 915, dpr: 1.75 },
  { w: 1440, h: 900, dpr: 2 },
];

(async () => {
  const browser = await chromium.launch();
  const need = {};   // image file -> widest device px required
  for (const p of PROFILES) {
    const ctx = await browser.newContext({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto("http://127.0.0.1:3000" + path, { waitUntil: "load", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(400);
      const rows = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          const bg = getComputedStyle(el).backgroundImage;
          if (!bg || bg === "none") continue;
          for (const m of bg.matchAll(/url\(["']?([^"')]+)/g)) {
            const r = el.getBoundingClientRect();
            if (r.width > 0) out.push({ url: m[1], w: r.width });
          }
        }
        return out;
      });
      for (const r of rows) {
        const file = r.url.split("/").pop().split("?")[0];
        if (!file.endsWith(".webp")) continue;
        const required = Math.ceil(r.w * p.dpr);
        need[file] = Math.max(need[file] || 0, required);
      }
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync("tools/bg-need.json", JSON.stringify(need, null, 2));
  const keys = Object.keys(need).sort();
  console.log("background images measured: " + keys.length);
  for (const k of keys) console.log("  " + k.padEnd(34) + need[k] + "px needed");
})();
