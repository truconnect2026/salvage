/*
 * Rendered-state gates.  Usage:  node scripts/gate.mjs <baseUrl>
 *
 * Standing rule 5: rendered state is the only truth.  Every expectation is read
 * out of this repo's lib/client.config.ts; every observed value is read out of
 * HTML, bytes, or a live DOM served by <baseUrl>.  Nothing asserts on class names.
 *
 * Gates 1-11 are plain fetches.  Gates 12-20 drive a real browser and need
 * Playwright, which is deliberately not a dependency of this project (its
 * postinstall downloads ~200MB of browsers and Vercel installs devDependencies
 * on every build).  Install it out-of-tree and point NODE_PATH at it:
 *
 *   npm i playwright --prefix <somewhere-outside-this-repo>
 *   npx playwright install chromium
 *   NODE_PATH=<somewhere-outside-this-repo>/node_modules \
 *     node scripts/gate.mjs http://localhost:3000
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

/* ---------- expectations: parsed from lib/client.config.ts ---------------- */

const src = readFileSync(join(ROOT, "lib", "client.config.ts"), "utf8");

const need = (re, label) => {
  const m = src.match(re);
  if (!m) throw new Error(`gate setup: could not read ${label} from lib/client.config.ts`);
  return m[1];
};

const defaultId = need(/export const DEFAULT_PRESET = "([^"]+)"/, "DEFAULT_PRESET");
const ctaHref = need(/ctaHref:\s*"([^"]+)"/, "COPY.ctaHref");
const shareOrigin = need(/export const SHARE_ORIGIN = "([^"]+)"/, "SHARE_ORIGIN");

/* Every preset, sliced out of the PRESETS array by its id marker. */
const presets = (() => {
  const marks = [];
  const re = /id: "([a-z]+)"/g;
  let m;
  while ((m = re.exec(src))) marks.push({ id: m[1], at: m.index });
  if (marks.length === 0) throw new Error("gate setup: no presets found");

  return marks.map((mark, i) => {
    const block = src.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : src.length);
    const pick = (r, label) => {
      const hit = block.match(r);
      if (!hit) throw new Error(`gate setup: could not read ${label} for preset "${mark.id}"`);
      return hit[1];
    };
    return {
      id: mark.id,
      bizName: pick(/bizName:\s*"([^"]+)"/, "bizName"),
      ticket: Number(pick(/ticket:\s*(\d+)/, "ticket")),
      missedPerMonth: Number(pick(/missedPerMonth:\s*(\d+)/, "missedPerMonth")),
      callsCaught: Number(pick(/callsCaught:\s*(\d+)/, "callsCaught")),
      recovered: Number(pick(/recovered:\s*(\d+)/, "recovered")),
      lost: Number(pick(/lost:\s*(\d+)/, "lost")),
      bubbles: (block.match(/\{\s*from:/g) ?? []).length,
    };
  });
})();

const byId = (id) => {
  const p = presets.find((x) => x.id === id);
  if (!p) throw new Error(`gate setup: preset "${id}" not in config`);
  return p;
};

const expected = { ...byId(defaultId), ctaHref };

/* Independent reimplementation of lib/format.ts — deliberately not imported. */
const usd = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/* ---------- shared HTML helpers ------------------------------------------ */

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/* Strip <script> so the RSC flight payload cannot satisfy a DOM assertion. */
const strip = (raw) => raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

const elementsIn = (html, attr) => {
  // Matches an element carrying `attr`, capturing its inner HTML. Marked
  // elements never nest another element of the same tag, so the lazy close is safe.
  const pattern = "<([a-z]+)(?=[^>]*\\s" + attr + "[\\s=>])[^>]*>([\\s\\S]*?)</\\1>";
  return [...html.matchAll(new RegExp(pattern, "gi"))].map((m) => decode(m[2]));
};

async function getPage(path) {
  const res = await fetch(base + path, { headers: { "cache-control": "no-cache" } });
  const raw = await res.text();
  const html = strip(raw);
  return {
    status: res.status,
    html,
    text: decode(html),
    bubbles: (html.match(/data-bubble="/g) ?? []).length,
    biz: elementsIn(html, "data-biz-name"),
  };
}

/* ---------- results ------------------------------------------------------ */

const results = [];
const check = (n, name, pass, detail) => results.push({ n, name, pass, detail });

/* ---------- 1-7: change-1 floor, raw HTML from / ------------------------- */

const home = await getPage("");
if (home.status !== 200) throw new Error(`gate setup: GET ${base}/ returned ${home.status}`);

const observed = {
  bubbles: home.bubbles,
  ledger: elementsIn(home.html, "data-ledger-recovered"),
  calls: elementsIn(home.html, "data-calls-caught"),
  math: elementsIn(home.html, "data-math"),
  biz: home.biz,
  anchors: [...home.html.matchAll(/<a\b[^>]*\shref="([^"]*)"/gi)].map((m) => m[1]),
};

check(
  1,
  "thread bubble count",
  observed.bubbles > 0 && observed.bubbles === expected.bubbles,
  `rendered ${observed.bubbles}, config ${expected.bubbles} (must also be > 0)`,
);

check(
  2,
  "ledger recovered",
  observed.ledger.length === 1 && observed.ledger[0] === usd(expected.recovered),
  `rendered ${JSON.stringify(observed.ledger[0] ?? null)}, expected ${JSON.stringify(usd(expected.recovered))}`,
);

const callsNum = observed.calls.length === 1 ? Number((observed.calls[0].match(/\d+/) ?? [])[0]) : NaN;
check(
  3,
  "calls caught",
  callsNum === expected.callsCaught,
  `rendered ${JSON.stringify(observed.calls[0] ?? null)} -> ${callsNum}, expected ${expected.callsCaught}`,
);

const mathText = observed.math[0] ?? "";
const wholeNumber = (n) => new RegExp("(?<!\\d)" + n + "(?!\\d)").test(mathText);
const mathHasMissed = wholeNumber(expected.missedPerMonth);
const mathHasTicket = wholeNumber(expected.ticket);
check(
  4,
  "math line numbers",
  observed.math.length === 1 && mathHasMissed && mathHasTicket,
  `missedPerMonth ${expected.missedPerMonth}: ${mathHasMissed}, ticket ${expected.ticket}: ${mathHasTicket} | ${JSON.stringify(mathText)}`,
);

const ctaMatches = observed.anchors.filter((h) => h === expected.ctaHref);
check(
  5,
  "single CTA anchor",
  ctaMatches.length === 1,
  `${ctaMatches.length} anchor(s) with href ${expected.ctaHref}, ${observed.anchors.length} anchor(s) total`,
);

check(
  6,
  "bizName in phone header",
  observed.biz.length === 1 && observed.biz[0] === expected.bizName,
  `rendered ${JSON.stringify(observed.biz)}, expected exactly one ${JSON.stringify(expected.bizName)}`,
);

const ogRes = await fetch(`${base}/og.png`, { headers: { "cache-control": "no-cache" } });
let ogDims = null;
let ogNote = `HTTP ${ogRes.status}`;
if (ogRes.ok) {
  const buf = Buffer.from(await ogRes.arrayBuffer());
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") ogNote = `not a PNG (magic ${sig})`;
  else {
    ogDims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    ogNote = `${ogDims.w}x${ogDims.h}, ${buf.length} bytes`;
  }
}
check(
  7,
  "og.png served at 2400x1260",
  ogDims !== null && ogDims.w === 2400 && ogDims.h === 1260,
  `${base}/og.png -> ${ogNote}`,
);

/* ---------- 8-11: SSR is the causal source of the preset ----------------- */

check(
  8,
  "SSR no-JS floor on /",
  home.bubbles > 0 && home.bubbles === expected.bubbles && home.biz[0] === expected.bizName,
  `${home.bubbles} bubbles (need ${expected.bubbles}, > 0), header ${JSON.stringify(home.biz[0] ?? null)}`,
);

const homePreset = byId("home");
const ssrHome = await getPage("/?biz=home");
const wantHome = [
  usd(homePreset.recovered),
  `$${homePreset.ticket}`,
  usd(homePreset.lost),
];
const missHome = wantHome.filter((s) => !ssrHome.text.includes(s));
check(
  9,
  "SSR /?biz=home",
  ssrHome.status === 200 &&
    ssrHome.bubbles === homePreset.bubbles &&
    ssrHome.bubbles > 0 &&
    ssrHome.biz[0] === homePreset.bizName &&
    missHome.length === 0,
  `HTTP ${ssrHome.status}, ${ssrHome.bubbles} bubbles, header ${JSON.stringify(ssrHome.biz[0] ?? null)}, missing ${JSON.stringify(missHome)}`,
);

const dentalPreset = byId("dental");
const ssrDental = await getPage("/?biz=dental");
const wantDental = [usd(dentalPreset.recovered), usd(dentalPreset.lost)];
const missDental = wantDental.filter((s) => !ssrDental.text.includes(s));
check(
  10,
  "SSR /?biz=dental",
  ssrDental.status === 200 &&
    ssrDental.bubbles > 0 &&
    ssrDental.biz[0] === dentalPreset.bizName &&
    missDental.length === 0,
  `HTTP ${ssrDental.status}, ${ssrDental.bubbles} bubbles, header ${JSON.stringify(ssrDental.biz[0] ?? null)}, missing ${JSON.stringify(missDental)}`,
);

const ssrJunk = await getPage("/?biz=garbage");
check(
  11,
  "unknown ?biz falls back to default, HTTP 200",
  ssrJunk.status === 200 &&
    ssrJunk.bubbles > 0 &&
    ssrJunk.biz[0] === expected.bizName &&
    ssrJunk.text.includes(usd(expected.recovered)),
  `HTTP ${ssrJunk.status}, header ${JSON.stringify(ssrJunk.biz[0] ?? null)}, expected ${JSON.stringify(expected.bizName)}`,
);

/* ---------- 12-20: the live DOM ------------------------------------------ */

let chromium = null;
let browserError = null;
try {
  chromium = createRequire(import.meta.url)("playwright").chromium;
} catch (err) {
  browserError = err.message;
}

/* Effective opacity: walks ancestors, so a hidden or faded parent counts. */
const EFF = `(el) => {
  let o = 1, n = el;
  while (n && n.nodeType === 1) {
    const s = getComputedStyle(n);
    if (s.display === "none" || s.visibility === "hidden") return 0;
    o *= parseFloat(s.opacity || "1");
    n = n.parentElement;
  }
  return o;
}`;

/* A real function, not a string: Playwright ignores arguments when handed a
   string, which would silently yield undefined snapshots. */
const sampleFn = (EFF) => {
  const vis = eval(EFF);
  const root = document.querySelector("[data-demo]");
  const bubbles = [...document.querySelectorAll("[data-bubble]")];
  const shown = bubbles.filter((b) => vis(b) > 0.5);
  const last = shown[shown.length - 1];
  const port = document.querySelector("[data-thread-area]")?.parentElement ?? null;
  const stack = document.querySelector("[data-thread-area]");
  const screen = document.querySelector("[data-phone-screen]");
  const ledger = document.querySelector("[data-ledger-recovered]");
  const leak = document.querySelector("[data-leak-lost]");
  const replay = document.querySelector("[data-replay]");
  const share = document.querySelector("[data-share]");
  const delivered = document.querySelector("[data-delivered]");
  return {
    t: root ? root.getAttribute("data-t") : null,
    total: bubbles.length,
    visible: shown.length,
    ledger: ledger ? ledger.textContent.trim() : null,
    leak: leak ? leak.textContent.trim() : null,
    phoneH: screen ? screen.clientHeight : null,
    delivered: delivered ? vis(delivered) > 0.5 : false,
    replay: replay ? vis(replay) > 0.5 : false,
    share: share ? vis(share) > 0.5 : false,
    biz: (document.querySelector("[data-biz-name]") || {}).textContent || null,
    url: location.href,
    anchorGap: last && port
      ? Math.round(port.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom)
      : null,
    // True empty space above the stack: the reserved content box minus the
    // stack itself. Excludes the viewport padding, which exists either way.
    reserveAbove: stack && port
      ? (() => {
          const cs = getComputedStyle(port);
          const inner =
            port.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
          return Math.round(inner - stack.getBoundingClientRect().height);
        })()
      : null,
  };
};

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

const numeric = (s) => (s == null ? NaN : Number(String(s).replace(/[^0-9.-]/g, "")));

if (!chromium) {
  for (const n of [12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    check(n, "browser gate", false, `playwright unavailable: ${browserError}`);
  }
} else {
  const browser = await chromium.launch();

  /* --- motion-on pass: one load, sampled at three phases --- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    const snaps = {};
    for (const T of [0.3, 2.5, 6.0]) {
      await waitT(page, T);
      snaps[T] = await page.evaluate(sampleFn, EFF);
    }

    const finalLedger = usd(expected.recovered);
    const finalLeak = usd(expected.lost);

    check(
      12,
      "bubble reveal follows the timeline",
      snaps[0.3].total === expected.bubbles &&
        snaps[0.3].visible === 1 &&
        snaps[6.0].visible === expected.bubbles &&
        snaps[6.0].delivered === true,
      `t=0.3 visible ${snaps[0.3].visible}/${snaps[0.3].total} (need exactly 1), ` +
        `t=6.0 visible ${snaps[6.0].visible} (need ${expected.bubbles}) delivered ${snaps[6.0].delivered}`,
    );

    check(
      13,
      "ledger counts to final",
      snaps[0.3].ledger != null &&
        snaps[6.0].ledger != null &&
        snaps[0.3].ledger !== finalLedger &&
        snaps[6.0].ledger === finalLedger,
      `t=0.3 ${JSON.stringify(snaps[0.3].ledger)} (must differ from final), ` +
        `t=6.0 ${JSON.stringify(snaps[6.0].ledger)} vs final ${JSON.stringify(finalLedger)}`,
    );

    const leakMid = numeric(snaps[2.5].leak);
    check(
      14,
      "leak climbs the whole timeline",
      snaps[0.3].leak != null &&
        snaps[0.3].leak !== finalLeak &&
        Number.isFinite(leakMid) &&
        leakMid !== 0 &&
        snaps[6.0].leak === finalLeak,
      `t=0.3 ${JSON.stringify(snaps[0.3].leak)} (must differ from final), ` +
        `t=2.5 ${JSON.stringify(snaps[2.5].leak)} -> ${leakMid} (must be non-zero), ` +
        `t=6.0 ${JSON.stringify(snaps[6.0].leak)} vs final ${JSON.stringify(finalLeak)}`,
    );

    const heights = [snaps[0.3].phoneH, snaps[2.5].phoneH, snaps[6.0].phoneH];
    check(
      15,
      "phone height never reflows",
      heights.every((h) => typeof h === "number" && h > 0) &&
        heights[0] === heights[1] &&
        heights[1] === heights[2],
      `clientHeight at t=0.3/2.5/6.0 -> ${heights.join(" / ")}`,
    );

    const s = snaps[0.3];
    check(
      16,
      "thread is bottom-anchored in a reserved box",
      s.visible === 1 &&
        s.anchorGap != null &&
        Math.abs(s.anchorGap) <= 24 &&
        s.reserveAbove != null &&
        s.reserveAbove > 24,
      `t=0.3 visible ${s.visible} (need exactly 1), bubble bottom is ${s.anchorGap}px above the ` +
        `thread area bottom (need <= 24), reserved empty space above ${s.reserveAbove}px (need > 24)`,
    );

    await ctx.close();
  }

  /* --- 17: reduced motion --- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(
      () => document.querySelector("[data-demo]")?.getAttribute("data-t") != null,
    );
    await page.waitForTimeout(300);
    const r = await page.evaluate(sampleFn, EFF);

    check(
      17,
      "reduced motion settles immediately",
      r.visible === expected.bubbles &&
        r.visible > 0 &&
        r.ledger === usd(expected.recovered) &&
        r.leak === usd(expected.lost) &&
        r.replay === false &&
        r.share === true,
      `visible ${r.visible}/${expected.bubbles}, ledger ${JSON.stringify(r.ledger)}, ` +
        `leak ${JSON.stringify(r.leak)}, replay visible ${r.replay} (need false), ` +
        `share visible ${r.share} (need true)`,
    );

    await ctx.close();
  }

  /* --- 18: preset switching --- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.click("[data-preset='home']");
    let ok = true;
    try {
      await page.waitForFunction(
        (want) => document.querySelector("[data-biz-name]")?.textContent?.trim() === want,
        homePreset.bizName,
        { timeout: 10000 },
      );
    } catch {
      ok = false;
    }
    const after = await page.evaluate(sampleFn, EFF);
    check(
      18,
      "preset click re-skins and rewrites the URL",
      ok && after.biz?.trim() === homePreset.bizName && after.url.includes("biz=home"),
      `header ${JSON.stringify(after.biz?.trim() ?? null)} (need ${JSON.stringify(homePreset.bizName)}), url ${after.url}`,
    );
    await ctx.close();
  }

  /* --- 19: share puts the deep link on the clipboard --- */
  {
    const origin = new URL(base).origin;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 5.3);
    await page.click("[data-share]");
    await page.waitForTimeout(250);
    let clip = null;
    let clipErr = null;
    try {
      clip = await page.evaluate(() => navigator.clipboard.readText());
    } catch (err) {
      clipErr = err.message;
    }
    const wantShare = `${shareOrigin}/?biz=${expected.id}`;
    check(
      19,
      "share copies the ?biz deep link",
      clip === wantShare,
      `clipboard ${JSON.stringify(clip)} (err ${clipErr ?? "none"}), expected ${JSON.stringify(wantShare)}`,
    );
    await ctx.close();
  }

  /* --- 20: gold is spent only on recovered money --- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 6.0);

    const gold = await page.evaluate(() => {
      const hex = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-gold")
        .trim();
      const h = hex.replace("#", "");
      const rgb = `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      const region = document.querySelector("[data-money]");
      if (!region) return { token: hex, rgb, count: -1, tags: [], leak: null, ledger: null };
      const all = [...region.querySelectorAll("*")];
      const hits = all.filter((el) => getComputedStyle(el).color === rgb);
      const leakEl = region.querySelector("[data-leak-lost]");
      const ledgerEl = region.querySelector("[data-ledger-recovered]");
      return {
        token: hex,
        rgb,
        count: hits.length,
        tags: hits.map((el) => el.getAttribute("data-ledger-recovered") != null
          ? "data-ledger-recovered"
          : el.tagName.toLowerCase() + "." + (el.className || "").toString().slice(0, 24)),
        leak: leakEl ? getComputedStyle(leakEl).color : null,
        ledger: ledgerEl ? getComputedStyle(ledgerEl).color : null,
      };
    });

    check(
      20,
      "gold is reserved for recovered money",
      gold.count === 1 &&
        gold.tags[0] === "data-ledger-recovered" &&
        gold.ledger === gold.rgb &&
        gold.leak !== null &&
        gold.leak !== gold.rgb,
      `token ${gold.token} -> ${gold.rgb}; ${gold.count} gold element(s) in [data-money] ${JSON.stringify(gold.tags)}; ` +
        `ledger color ${gold.ledger}; leak color ${gold.leak} (must not be gold)`,
    );

    await ctx.close();
  }

  await browser.close();
}

/* ---------- report ------------------------------------------------------- */

results.sort((a, b) => a.n - b.n);
console.log(`gate: ${base}  (preset "${defaultId}")`);
for (const r of results) {
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
}

const failed = results.filter((r) => !r.pass);
console.log(
  failed.length === 0
    ? `\nALL ${results.length} GATES PASS`
    : `\n${failed.length} GATE(S) RED: ${failed.map((r) => r.n).join(", ")}`,
);

/* exitCode, not exit(): let libuv tear the fetch handles down cleanly on Windows. */
process.exitCode = failed.length === 0 ? 0 : 1;
