/*
 * change 48: performance, gates 232-233.  Run by scripts/gate.mjs after the
 * /go block, or alone:
 *
 *   NODE_PATH=<playwright+lighthouse>/node_modules node scripts/gate-perf.mjs <baseUrl>
 *
 * 232 — first-load JS budgets.  The module scripts a route's HTML loads, each
 *       fetched and gzipped (-9), summed: / <= 150 KB, /go <= 145 KB.  The
 *       noModule polyfill chunk is left out — no browser that runs modules
 *       downloads it.  Chunks fetched later (sections 2-4 on the first scroll,
 *       the voices on the first sound, analytics at idle) are not first-load
 *       JS and are not counted.
 * 233 — Lighthouse mobile (simulated throttling), the median of 3 runs per
 *       route: performance >= 94 on /, >= 95 on /go; accessibility = 100 on
 *       both.
 *
 * The floors are Andy's (change 48 veto).  /go's budget was 110 KB; the App
 * Router's framework floor alone is 130.9 KB gz (no page code), so the
 * budget is 145 KB — the route measured 142.1 at the veto.  /'s perf floor
 * was 95; it measured 93-95 on this host (median 94), and the remaining
 * lever, a lighter phone mockup, folds into change 43b.
 *
 * The CPU multiplier.  Lighthouse's default 4x assumes a host fast enough
 * that 4x slower is a mid-range phone; it warns below benchmarkIndex 1000.
 * This machine measures 750-1300, so 4x here models a phone several times
 * slower than the one PageSpeed Insights targets.  Lighthouse's own
 * throttling guidance scales the multiplier with the host's benchmarkIndex.
 * The floors (Andy's change-48 veto) were set on x1.7 — about
 * benchmarkIndex / 500 for this host when it was calibrated — so x1.7 is
 * the default.  PERF_CPU=auto re-derives it from a warm-up run's
 * benchmarkIndex (/ 500, clamped 1-4); PERF_CPU=<n> forces n (4 reproduces
 * the uncalibrated figure).  Every run's benchmarkIndex is printed.
 *
 * Rendered state is the only truth: the bytes are the bytes the server
 * sends; the scores are Lighthouse's, read off its report.  Chrome is
 * launched on its own profile and closed through its own handle only.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

export const ROUTES = [
  { name: "/", path: "/", jsBudgetKb: 150, perfFloor: 94 },
  { name: "/go", path: "/go?biz=Short%20Pump%20Heating%20%26%20Air&trade=hvac&demo=1", jsBudgetKb: 145, perfFloor: 95 },
];
const A11Y_FLOOR = 100;
const RUNS = 3;

async function firstLoadJs(base, path) {
  const res = await fetch(base + path);
  const html = await res.text();
  if (res.status !== 200) throw new Error(`${path} answered ${res.status}`);
  const parts = [];
  for (const m of html.matchAll(/<script([^>]*)src="([^"]+)"([^>]*)>/g)) {
    if (/nomodule/i.test(m[1] + m[3])) continue;
    const body = Buffer.from(await (await fetch(new URL(m[2], base))).arrayBuffer());
    parts.push({ file: m[2].split("/").pop(), gz: zlib.gzipSync(body, { level: 9 }).length });
  }
  return { total: parts.reduce((a, p) => a + p.gz, 0), parts };
}

export async function runPerfGates({ base, check }) {
  /* PERF_ONLY=232 runs just that gate — mutation proofs from the standalone
     entry only; scripts/gate.mjs never sets it. */
  const only = (process.env.PERF_ONLY ?? "").split(",").map(Number).filter(Boolean);
  const want = (n) => only.length === 0 || only.includes(n);

  if (want(232)) {
    let ok = true;
    const notes = [];
    for (const r of ROUTES) {
      try {
        const js = await firstLoadJs(base, r.path);
        const kb = js.total / 1024;
        const pass = kb <= r.jsBudgetKb;
        ok &&= pass;
        notes.push(`${r.name} ${kb.toFixed(1)} KB gz of ${r.jsBudgetKb} ${pass ? "ok" : "OVER"} (${js.parts.length} module scripts)`);
      } catch (err) {
        ok = false;
        notes.push(`${r.name} THREW: ${String(err.message).slice(0, 120)}`);
      }
    }
    check(232, "48: first-load JS budgets — module scripts, gzip -9 (/ <= 150 KB, /go <= 145 KB)", ok, notes.join(" | "));
  }

  if (want(233)) {
    let ok = true;
    const notes = [];
    const auto = process.env.PERF_CPU === "auto";
    let cpu = auto ? 0 : Number(process.env.PERF_CPU ?? 1.7);
    let chrome = null;
    try {
      const req = createRequire(import.meta.url);
      const lighthouse = (await import(pathToFileURL(req.resolve("lighthouse")).href)).default;
      const launcher = req("chrome-launcher");
      const profileDir = join(tmpdir(), `salvage-${process.pid}-gate233`);
      mkdirSync(profileDir, { recursive: true });
      chrome = await launcher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"], userDataDir: profileDir });
      if (!cpu) {
        /* The warm-up: one perf-only run, read for the host's speed. */
        const w = await lighthouse(base + ROUTES[0].path, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance"] }, { extends: "lighthouse:default" });
        const bi = w.lhr.environment.benchmarkIndex;
        cpu = Math.round(Math.min(4, Math.max(1, bi / 500)) * 100) / 100;
        notes.push(`host benchmarkIndex ${Math.round(bi)} -> CPU x${cpu}`);
      }
      for (const r of ROUTES) {
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
          const out = await lighthouse(
            base + r.path,
            { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility"] },
            { extends: "lighthouse:default", settings: { throttling: { cpuSlowdownMultiplier: cpu } } },
          );
          const l = out.lhr;
          if (l.runtimeError) throw new Error(`${r.name}: ${l.runtimeError.code}`);
          runs.push({
            perf: Math.round(l.categories.performance.score * 100),
            a11y: Math.round(l.categories.accessibility.score * 100),
            bi: Math.round(l.environment.benchmarkIndex),
            lcp: l.audits["largest-contentful-paint"].numericValue,
            tbt: l.audits["total-blocking-time"].numericValue,
          });
        }
        const med = [...runs].sort((a, b) => a.perf - b.perf)[Math.floor(RUNS / 2)];
        const a11yMin = Math.min(...runs.map((x) => x.a11y));
        const pass = med.perf >= r.perfFloor && a11yMin >= A11Y_FLOOR;
        ok &&= pass;
        notes.push(
          `${r.name} perf ${runs.map((x) => x.perf).join("/")} median ${med.perf} (floor ${r.perfFloor}), a11y ${a11yMin}, ` +
            `median-run LCP ${(med.lcp / 1000).toFixed(1)}s TBT ${Math.round(med.tbt)}ms, benchmarkIndex ${runs.map((x) => x.bi).join("/")} ${pass ? "ok" : "RED"}`,
        );
      }
    } catch (err) {
      ok = false;
      notes.push(`THREW: ${String(err.message).split("\n")[0].slice(0, 160)}`);
    } finally {
      if (chrome) {
        try {
          await chrome.kill();
        } catch {
          /* own handle only; nothing else to close */
        }
      }
    }
    check(233, `48: Lighthouse mobile, median of ${RUNS} — perf >= ${ROUTES.map((r) => `${r.perfFloor} on ${r.name}`).join(", ")}; a11y = ${A11Y_FLOOR} (CPU x${cpu})`, ok, notes.join(" | "));
  }
}

/* Standalone. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const results = [];
  await runPerfGates({ base, check: (n, name, pass, detail) => results.push({ n, name, pass, detail }) });
  if (process.env.PERF_ONLY) console.log(`  (filtered: PERF_ONLY=${process.env.PERF_ONLY})`);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} PERF GATE(S) RED: ${failed.map((r) => r.n).join(", ")}` : `\nALL ${results.length} PERF GATES PASS`);
  process.exitCode = failed.length ? 1 : 0;
}
