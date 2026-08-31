/*
 * Renders public/og.png and the change-N review screenshots.
 *
 * Playwright is deliberately NOT a dependency of this project: the `playwright`
 * npm package downloads ~200MB of browser binaries in a postinstall hook, and
 * Vercel installs devDependencies on every build. Install it out-of-tree and
 * point NODE_PATH at it:
 *
 *   npm i playwright --prefix <somewhere-outside-this-repo>
 *   npx playwright install chromium
 *   NODE_PATH=<somewhere-outside-this-repo>/node_modules \
 *     node scripts/shoot.mjs http://localhost:3000 review/change-1
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const outDir = join(ROOT, process.argv[3] ?? "review/change-1");

const VIEWPORTS = [
  { name: "mobile-390x844.png", width: 390, height: 844 },
  { name: "desktop-1440x900.png", width: 1440, height: 900 },
];

const ogPath = join(ROOT, "public", "og.png");

mkdirSync(outDir, { recursive: true });
mkdirSync(join(ROOT, "public"), { recursive: true });

const browser = await chromium.launch();

/* 1. OG image: exactly 1200x630 at 2x -> 2400x1260. */
{
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
  });
  await page.goto(`${base}/og`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: ogPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await page.close();
  console.log(`og      -> ${ogPath}`);
}

/* 2. Review screenshots: viewport-exact (above the fold) and full page. */
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const fold = join(outDir, vp.name);
  await page.screenshot({ path: fold });
  console.log(`${vp.width}x${vp.height} -> ${fold}`);

  const full = join(outDir, vp.name.replace(/\.png$/, "-full.png"));
  await page.screenshot({ path: full, fullPage: true });
  console.log(`${vp.width}xfull -> ${full}`);

  await page.close();
}

/* 3. Drop the OG thumbnail next to the screenshots so it can be eyeballed. */
copyFileSync(ogPath, join(outDir, "og.png"));
console.log(`og copy -> ${join(outDir, "og.png")}`);

await browser.close();
