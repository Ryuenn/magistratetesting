// Measure every <img>'s real rendered CSS size at mobile and desktop widths.
const { chromium } = require("playwright");
const fs = require("fs");
const VIEWPORTS = { mobile: 412, desktop: 1440 };
const PAGES = fs.readdirSync("c:/Projects/MagistrateTesting")
  .filter(f => f.endsWith(".html") && !f.startsWith("google"))
  .map(f => "/" + (f === "index.html" ? "" : f.replace(/\.html$/, "")));

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const [label, width] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto("http://127.0.0.1:3000" + path, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(250);
      const data = await page.evaluate(() => [...document.querySelectorAll("img")].map(el => {
        const r = el.getBoundingClientRect();
        return { src: el.getAttribute("src"), cls: (el.className || "").split(" ")[0],
                 w: Math.round(r.width), h: Math.round(r.height) };
      }));
      for (const d of data) {
        if (!d.src || d.w === 0) continue;
        const key = d.cls || d.src;
        out[key] = out[key] || { srcs: new Set(), mobile: 0, desktop: 0 };
        out[key].srcs.add(d.src);
        out[key][label] = Math.max(out[key][label], d.w);
      }
    }
    await ctx.close();
  }
  await browser.close();
  const plain = {};
  for (const [k, v] of Object.entries(out)) plain[k] = { srcs: [...v.srcs], mobile: v.mobile, desktop: v.desktop };
  fs.writeFileSync("measured.json", JSON.stringify(plain, null, 2));
  console.log("class".padEnd(36) + "mobile".padStart(8) + "desktop".padStart(9));
  for (const [k, v] of Object.entries(plain).sort((a, b) => b[1].desktop - a[1].desktop))
    console.log(k.slice(0, 35).padEnd(36) + String(v.mobile).padStart(8) + String(v.desktop).padStart(9));
})();
