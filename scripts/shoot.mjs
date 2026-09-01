/*
 * Renders public/og.png and the review screenshots.
 *
 *   node scripts/shoot.mjs <base> <outDir> shell      # og + fold + full page
 *   node scripts/shoot.mjs <base> <outDir> playback   # timed playback frames
 *
 * Playwright is deliberately NOT a dependency of this project: the `playwright`
 * npm package downloads ~200MB of browser binaries in a postinstall hook, and
 * Vercel installs devDependencies on every build. Install it out-of-tree and
 * point NODE_PATH at it:
 *
 *   npm i playwright --prefix <somewhere-outside-this-repo>
 *   npx playwright install chromium
 *   NODE_PATH=<somewhere-outside-this-repo>/node_modules \
 *     node scripts/shoot.mjs http://localhost:3000 review/change-2 playback
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
const mode = process.argv[4] ?? "shell";

const VIEWPORTS = [
  { slug: "mobile-390x844", width: 390, height: 844 },
  { slug: "desktop-1440x900", width: 1440, height: 900 },
];

/* The playback phases the gates also sample: first frame, mid-leak, settled. */
const PHASES = [0.3, 2.5, 6.0];

const ogPath = join(ROOT, "public", "og.png");

mkdirSync(outDir, { recursive: true });
mkdirSync(join(ROOT, "public"), { recursive: true });

const browser = await chromium.launch();

async function waitT(page, target) {
  await page.waitForFunction(
    (tt) => {
      const el = document.querySelector("[data-demo]");
      const v = parseFloat(el?.getAttribute("data-t") ?? "");
      return Number.isFinite(v) && v >= tt;
    },
    target,
    { timeout: 30000 },
  );
}

if (mode === "shell") {
  /* 1. OG image: exactly 1200x630 at 2x -> 2400x1260. */
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
  });
  await page.goto(`${base}/og`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: ogPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await page.close();
  console.log(`og      -> ${ogPath}`);

  /* 2. Review screenshots: viewport-exact (above the fold) and full page. */
  for (const vp of VIEWPORTS) {
    const p = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    await p.goto(base, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);

    const fold = join(outDir, `${vp.slug}.png`);
    await p.screenshot({ path: fold });
    console.log(`${vp.width}x${vp.height} -> ${fold}`);

    const full = join(outDir, `${vp.slug}-full.png`);
    await p.screenshot({ path: full, fullPage: true });
    console.log(`${vp.width}xfull -> ${full}`);

    await p.close();
  }

  /* 3. Drop the OG thumbnail next to the screenshots so it can be eyeballed. */
  copyFileSync(ogPath, join(outDir, "og.png"));
  console.log(`og copy -> ${join(outDir, "og.png")}`);
} else if (mode === "playback") {
  /* Full-page captures at each phase, one page load per phase so every capture
     is a clean run of the timeline rather than a mid-flight seek. */
  for (const vp of VIEWPORTS) {
    for (const T of PHASES) {
      const p = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      await p.goto(base, { waitUntil: "domcontentloaded" });
      await p.evaluate(() => document.fonts.ready);
      await waitT(p, T);
      /* Freeze the phase at the target before capturing. Overriding rAF from the
         test side stops the loop advancing without touching app code, so the
         frame in the PNG is the frame the label claims. */
      await p.evaluate(() => {
        window.requestAnimationFrame = () => 0;
      });

      const out = join(outDir, `${vp.slug}-t${T.toFixed(1)}.png`);
      await p.screenshot({ path: out, fullPage: true });
      const seen = await p.evaluate(() => ({
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
        leak: document.querySelector("[data-leak-lost]")?.textContent,
        ledger: document.querySelector("[data-ledger-recovered]")?.textContent,
      }));
      console.log(`${vp.slug} t=${T} (captured at ${seen.t}, ledger ${seen.ledger}, leak ${seen.leak}) -> ${out}`);
      await p.close();
    }
  }
} else {
  throw new Error(`unknown mode "${mode}" (expected "shell" or "playback")`);
}

await browser.close();
