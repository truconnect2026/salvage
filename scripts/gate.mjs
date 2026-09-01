/*
 * Rendered-state gates.  Usage:  node scripts/gate.mjs <baseUrl>
 *
 * Standing rule 5: rendered state is the only truth.  Every expectation is read
 * out of this repo's lib/client.config.ts; every observed value is read out of
 * HTML, bytes, or a live DOM served by <baseUrl>.  Nothing asserts on class names.
 *
 * Timeline expectations are deliberately NOT read from lib/timeline.ts: a gate
 * that imported the timeline would move with it and could never catch a rebeat.
 *
 * Gates 1-11 and 21 are plain fetches.  Gates 12-20 and 22-24 drive a real
 * browser and need Playwright, which is deliberately not a dependency of this
 * project (its postinstall downloads ~200MB of browsers and Vercel installs
 * devDependencies on every build).  Install it out-of-tree and point NODE_PATH:
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
      callerNumber: pick(/callerNumber:\s*"([^"]+)"/, "callerNumber"),
      callReason: pick(/callReason:\s*"([^"]+)"/, "callReason"),
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

/*
 * Playback expectations, held here rather than imported from the timeline.
 * Beats are 1.3 / 2.6 / 3.7 / 4.4, so at these sample times the visible bubble
 * count is fully determined.
 */
const VISIBLE_AT = { 0.3: 0, 2.5: 1, 6.0: expected.bubbles };

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

/* ---------- 8-11, 21: SSR is the causal source of the preset ------------- */

check(
  8,
  "SSR no-JS floor on /",
  home.bubbles > 0 && home.bubbles === expected.bubbles && home.biz[0] === expected.bizName,
  `${home.bubbles} bubbles (need ${expected.bubbles}, > 0), header ${JSON.stringify(home.biz[0] ?? null)}`,
);

const homePreset = byId("home");
const ssrHome = await getPage("/?biz=home");
const wantHome = [usd(homePreset.recovered), `$${homePreset.ticket}`, usd(homePreset.lost)];
const missHome = wantHome.filter((s) => !ssrHome.text.includes(s));
check(
  9,
  "SSR /?biz=home",
  ssrHome.status === 200 &&
    ssrHome.bubbles === homePreset.bubbles &&
    ssrHome.bubbles > 0 &&
    ssrHome.biz[0] === homePreset.bizName &&
    missHome.length === 0,
  `HTTP ${ssrHome.status}, ${ssrHome.bubbles} bubbles (need ${homePreset.bubbles}), header ${JSON.stringify(ssrHome.biz[0] ?? null)}, missing ${JSON.stringify(missHome)}`,
);

const dentalPreset = byId("dental");
const ssrDental = await getPage("/?biz=dental");
const wantDental = [usd(dentalPreset.recovered), usd(dentalPreset.lost)];
const missDental = wantDental.filter((s) => !ssrDental.text.includes(s));
check(
  10,
  "SSR /?biz=dental",
  ssrDental.status === 200 &&
    ssrDental.bubbles === dentalPreset.bubbles &&
    ssrDental.bubbles > 0 &&
    ssrDental.biz[0] === dentalPreset.bizName &&
    missDental.length === 0,
  `HTTP ${ssrDental.status}, ${ssrDental.bubbles} bubbles (need ${dentalPreset.bubbles}), header ${JSON.stringify(ssrDental.biz[0] ?? null)}, missing ${JSON.stringify(missDental)}`,
);

const ssrJunk = await getPage("/?biz=garbage");
check(
  11,
  "unknown ?biz falls back to default, HTTP 200",
  ssrJunk.status === 200 &&
    ssrJunk.bubbles === expected.bubbles &&
    ssrJunk.bubbles > 0 &&
    ssrJunk.biz[0] === expected.bizName &&
    ssrJunk.text.includes(usd(expected.recovered)),
  `HTTP ${ssrJunk.status}, ${ssrJunk.bubbles} bubbles (need ${expected.bubbles}), header ${JSON.stringify(ssrJunk.biz[0] ?? null)}, expected ${JSON.stringify(expected.bizName)}`,
);

/* 21: the call card's identity fields are server-rendered for every preset,
   including the fallback. */
const callCardRows = [];
for (const { path, want } of [
  { path: "/?biz=salon", want: byId("salon") },
  { path: "/?biz=home", want: homePreset },
  { path: "/?biz=dental", want: dentalPreset },
]) {
  const page = await getPage(path);
  const caller = elementsIn(page.html, "data-caller");
  const reason = elementsIn(page.html, "data-call-reason");
  callCardRows.push({
    path,
    ok:
      page.status === 200 &&
      caller.length === 1 &&
      reason.length === 1 &&
      caller[0] === want.callerNumber &&
      reason[0].startsWith(want.callReason),
    caller: caller[0] ?? null,
    reason: reason[0] ?? null,
    wantCaller: want.callerNumber,
    wantReason: want.callReason,
  });
}
check(
  21,
  "SSR call card carries callerNumber + callReason",
  callCardRows.length === 3 && callCardRows.every((r) => r.ok),
  callCardRows
    .map((r) => `${r.path} -> ${JSON.stringify(r.caller)} / ${JSON.stringify(r.reason)} (want ${JSON.stringify(r.wantCaller)} / ${JSON.stringify(r.wantReason)})`)
    .join(" | "),
);

/* ---------- 12-20, 22-24: the live DOM ----------------------------------- */

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
  const vp = document.querySelector("[data-thread-viewport]");
  const stack = document.querySelector("[data-thread-area]");
  const card = document.querySelector("[data-call-card]");
  const screen = document.querySelector("[data-phone-screen]");
  const ledger = document.querySelector("[data-ledger-recovered]");
  const leak = document.querySelector("[data-leak-lost]");
  const replay = document.querySelector("[data-replay]");
  const share = document.querySelector("[data-share]");
  const delivered = document.querySelector("[data-delivered]");

  const vpcs = vp ? getComputedStyle(vp) : null;
  const vpr = vp ? vp.getBoundingClientRect() : null;
  const cardr = card ? card.getBoundingClientRect() : null;
  const stackr = stack ? stack.getBoundingClientRect() : null;

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
    cardVisible: card ? vis(card) > 0.5 : false,
    cardId: card ? card.getAttribute("data-call-card") : null,
    // Offsets, all in CSS px against the reserved box's content edges.
    cardTopGap: vpr && cardr ? Math.round(cardr.top - (vpr.top + parseFloat(vpcs.paddingTop))) : null,
    cardToStackGap: cardr && stackr ? Math.round(stackr.top - cardr.bottom) : null,
    stackBottomGap:
      vpr && stackr
        ? Math.round(vpr.bottom - parseFloat(vpcs.paddingBottom) - stackr.bottom)
        : null,
    lastBubbleGap:
      last && stackr ? Math.round(stackr.bottom - last.getBoundingClientRect().bottom) : null,
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

const BROWSER_GATES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24];

if (!chromium) {
  for (const n of BROWSER_GATES) {
    check(n, "browser gate", false, `playwright unavailable: ${browserError}`);
  }
} else {
  const browser = await chromium.launch();
  const failures = [];
  /* A page that never produces a demo must report red, not throw: an uncaught
     timeout would hide which assertions were never reached. */
  const block = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      failures.push(`${label}: ${String(err.message).slice(0, 160)}`);
    }
  };

  /* --- motion-on pass: one load, sampled at three phases --- */
  await block("motion", async () => {
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
        snaps[0.3].total > 0 &&
        snaps[0.3].visible === VISIBLE_AT[0.3] &&
        snaps[2.5].visible === VISIBLE_AT[2.5] &&
        snaps[6.0].visible === VISIBLE_AT[6.0] &&
        snaps[6.0].delivered === true,
      `${snaps[0.3].total} bubbles in DOM (need ${expected.bubbles}, > 0); visible ` +
        `t=0.3 ${snaps[0.3].visible}/${VISIBLE_AT[0.3]}, t=2.5 ${snaps[2.5].visible}/${VISIBLE_AT[2.5]}, ` +
        `t=6.0 ${snaps[6.0].visible}/${VISIBLE_AT[6.0]}, delivered ${snaps[6.0].delivered}`,
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
    const e = snaps[6.0];
    check(
      16,
      "call card tops a reserved box, thread anchored to its bottom",
      s.total === expected.bubbles &&
        s.total > 0 &&
        s.cardVisible === true &&
        s.cardTopGap != null &&
        Math.abs(s.cardTopGap) <= 24 &&
        s.cardToStackGap != null &&
        s.cardToStackGap > 24 &&
        s.stackBottomGap != null &&
        Math.abs(s.stackBottomGap) <= 24 &&
        e.stackBottomGap != null &&
        Math.abs(e.stackBottomGap) <= 24 &&
        // Sanity only, not an anchor claim: the Delivered line sits below the
        // last bubble inside the stack, so this gap is ~25px by construction.
        e.lastBubbleGap != null,
      `t=0.3: card top ${s.cardTopGap}px below the box top (need <= 24), ` +
        `gap card->stack ${s.cardToStackGap}px (need > 24), ` +
        `stack bottom ${s.stackBottomGap}px above the box bottom (need <= 24); ` +
        `t=6.0: stack bottom ${e.stackBottomGap}px, last bubble ${e.lastBubbleGap}px above stack bottom`,
    );

    await ctx.close();
  });

  /* --- 17: reduced motion --- */
  await block("reduced-motion", async () => {
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
        r.cardVisible === true &&
        r.ledger === usd(expected.recovered) &&
        r.leak === usd(expected.lost) &&
        r.replay === false &&
        r.share === true,
      `visible ${r.visible}/${expected.bubbles}, call card ${r.cardVisible}, ledger ${JSON.stringify(r.ledger)}, ` +
        `leak ${JSON.stringify(r.leak)}, replay visible ${r.replay} (need false), ` +
        `share visible ${r.share} (need true)`,
    );

    await ctx.close();
  });

  /* --- 18: preset switching --- */
  await block("preset-switch", async () => {
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

    /* A second click inside the swap window is discarded for playback. The URL
       must agree with whatever actually ended up on screen — never advertise a
       preset the page never rendered. */
    await page.click("[data-preset='dental']");
    await page.waitForTimeout(1200);
    const raced = await page.evaluate(sampleFn, EFF);
    const rendered = presets.find((p) => p.bizName === raced.biz?.trim());
    const urlBiz = new URL(raced.url).searchParams.get("biz");
    const agree = rendered != null && urlBiz === rendered.id;

    check(
      18,
      "preset click re-skins, and the URL never names a preset that is not rendered",
      ok &&
        after.biz?.trim() === homePreset.bizName &&
        after.url.includes("biz=home") &&
        agree,
      `first click -> header ${JSON.stringify(after.biz?.trim() ?? null)}, url ${after.url}; ` +
        `after a second click inside the swap window -> header ${JSON.stringify(raced.biz?.trim() ?? null)} ` +
        `(preset ${rendered?.id ?? "unknown"}), ?biz=${urlBiz} — must agree`,
    );
    await ctx.close();
  });

  /* --- 19: share puts the deep link on the clipboard --- */
  await block("share", async () => {
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
  });

  /* --- 20 + 23: colour tokens are spent where the brand says --- */
  await block("colour-tokens", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 6.0);

    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const toRgb = (name) => {
        const h = root.getPropertyValue(name).trim().replace("#", "");
        if (h.length < 6) return null;
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      const gold = toRgb("--color-gold");
      const region = document.querySelector("[data-money]");
      const hits = region
        ? [...region.querySelectorAll("*")].filter((el) => getComputedStyle(el).color === gold)
        : [];
      const card = document.querySelector("[data-call-card]");
      const cardCs = card ? getComputedStyle(card) : null;
      return {
        gold,
        muted: toRgb("--color-muted"),
        teal: toRgb("--color-teal"),
        goldCount: region ? hits.length : -1,
        goldTags: hits.map((el) =>
          el.getAttribute("data-ledger-recovered") != null ? "data-ledger-recovered" : el.tagName.toLowerCase(),
        ),
        ledgerColor: region
          ? getComputedStyle(region.querySelector("[data-ledger-recovered]")).color
          : null,
        leakColor: region ? getComputedStyle(region.querySelector("[data-leak-lost]")).color : null,
        ruleColor: cardCs ? cardCs.borderLeftColor : null,
        ruleWidth: cardCs ? cardCs.borderLeftWidth : null,
      };
    });

    check(
      20,
      "gold is reserved for recovered money",
      tokens.goldCount === 1 &&
        tokens.goldTags[0] === "data-ledger-recovered" &&
        tokens.ledgerColor === tokens.gold &&
        tokens.leakColor !== null &&
        tokens.leakColor !== tokens.gold,
      `gold ${tokens.gold}; ${tokens.goldCount} gold element(s) in [data-money] ${JSON.stringify(tokens.goldTags)}; ` +
        `ledger ${tokens.ledgerColor}; leak ${tokens.leakColor} (must not be gold)`,
    );

    check(
      23,
      "call card rule is muted, not teal, not gold",
      tokens.ruleColor != null &&
        tokens.muted != null &&
        tokens.ruleColor === tokens.muted &&
        tokens.ruleColor !== tokens.gold &&
        tokens.ruleColor !== tokens.teal &&
        parseFloat(tokens.ruleWidth) >= 2,
      `rule ${tokens.ruleColor} @ ${tokens.ruleWidth}; muted ${tokens.muted}, gold ${tokens.gold}, teal ${tokens.teal}`,
    );

    await ctx.close();
  });

  /* --- 22: the call card is present at the first frame and never re-mounted --- */
  await block("call-card-identity", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    await waitT(page, 0.1);
    const early = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const el = document.querySelector("[data-call-card]");
      if (!el) return null;
      el.__gateStamp = "change-3";
      return { id: el.getAttribute("data-call-card"), visible: vis(el) > 0.5 };
    }, EFF);

    await waitT(page, 6.0);
    const late = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const el = document.querySelector("[data-call-card]");
      if (!el) return null;
      return {
        id: el.getAttribute("data-call-card"),
        visible: vis(el) > 0.5,
        sameNode: el.__gateStamp === "change-3",
      };
    }, EFF);

    check(
      22,
      "call card is present at t=0.1 and still the same node at t=6.0",
      early != null &&
        late != null &&
        early.visible === true &&
        late.visible === true &&
        typeof early.id === "string" &&
        early.id.length > 0 &&
        early.id === late.id &&
        late.sameNode === true,
      `t=0.1 ${JSON.stringify(early)}; t=6.0 ${JSON.stringify(late)} (id must match and be non-empty, sameNode must be true)`,
    );

    await ctx.close();
  });

  /* --- 24: the switch must never climb before it drops --- */
  await block("switch-transition", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 5.3); // settled: the leak shows the OLD preset's full total

    const sampled = await page.evaluate(async (presetId) => {
      const num = (s) => Number(String(s ?? "").replace(/[^0-9.-]/g, ""));
      const leakEl = document.querySelector("[data-leak-lost]");
      const btn = document.querySelector(`[data-preset="${presetId}"]`);
      if (!leakEl || !btn) return null;
      const before = num(leakEl.textContent);
      btn.click();
      const series = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 700) {
        series.push(num(leakEl.textContent));
        await new Promise((r) => setTimeout(r, 100));
      }
      return { before, series };
    }, "home");

    const series = sampled?.series ?? [];
    const finite = series.filter((n) => Number.isFinite(n));
    const peak = finite.length ? Math.max(...finite) : NaN;
    check(
      24,
      "preset switch never climbs before it drops",
      sampled != null &&
        Number.isFinite(sampled.before) &&
        sampled.before > 0 &&
        series.length >= 5 &&
        finite.length === series.length &&
        peak <= sampled.before,
      `old on-screen value at click ${sampled?.before ?? null}; ${series.length} samples over 700ms ` +
        `(need >= 5, all finite); peak ${peak} (must not exceed ${sampled?.before ?? null}); ` +
        `series [${series.join(", ")}]`,
    );

    await ctx.close();
  });

  await browser.close();

  for (const n of BROWSER_GATES) {
    if (!results.some((r) => r.n === n)) {
      check(n, "browser gate", false, `not reached — ${failures.join(" | ") || "unknown error"}`);
    }
  }
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
