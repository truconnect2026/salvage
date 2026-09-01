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
      caught: [
        ...block.matchAll(
          /\{\s*number:\s*"([^"]+)",\s*detail:\s*"([^"]+)",\s*amount:\s*(\d+),\s*date:\s*"([^"]+)"\s*\}/g,
        ),
      ].map((m) => ({ number: m[1], detail: m[2], amount: Number(m[3]), date: m[4] })),
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
 * Beats are 0.9 / 2.2 / 3.3 / 4.0, so at these sample times the visible bubble
 * count is fully determined. Held independently of lib/timeline.ts on purpose:
 * a gate that imported the timeline would move with it and could never catch
 * a rebeat.
 */
const VISIBLE_AT = { 0.3: 0, 2.5: 2, 6.0: expected.bubbles };

if (expected.caught.length !== 4) {
  throw new Error(`gate setup: preset "${expected.id}" has ${expected.caught.length} caught entries, need 4`);
}
const row0 = expected.caught[0];

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

/* 25 + 27: the owner ledger panel is server-rendered — the no-JS floor covers
   the owner side too, not just the phone. Pure fetch, no browser needed: SSR
   is settled state (row0 visible, panel-recovered at the FINAL figure), so
   these read straight off the raw HTML. */
const ledgerRows = [];
for (const p of [byId("salon"), homePreset, dentalPreset]) {
  const page = await getPage(`/?biz=${p.id}`);
  // Row divs nest other divs (number/detail/amount/date), which breaks
  // elementsIn's lazy same-tag-close assumption — so amounts are read from the
  // dedicated leaf-level data-caught-amount marker, not the row wrapper.
  const rowTexts = [0, 1, 2, 3].map((i) => elementsIn(page.html, `data-caught-row="${i}"`)[0] ?? null);
  const amounts = [0, 1, 2, 3].map((i) => {
    const hit = elementsIn(page.html, `data-caught-amount="${i}"`)[0];
    if (!hit) return null;
    const m = hit.match(/[\d,]+/);
    return m ? Number(m[0].replace(/,/g, "")) : null;
  });
  const panelRecovered = elementsIn(page.html, "data-panel-recovered");
  ledgerRows.push({
    id: p.id,
    path: `/?biz=${p.id}`,
    status: page.status,
    rowCount: rowTexts.filter(Boolean).length,
    row0HasNumber: rowTexts[0] != null && rowTexts[0].includes(p.caught[0].number),
    wantRow0Number: p.caught[0].number,
    row0Text: rowTexts[0],
    panelRecovered: panelRecovered[0] ?? null,
    wantPanelRecovered: usd(p.recovered),
    amounts,
    sum: amounts.every((a) => a != null) ? amounts.reduce((a, b) => a + b, 0) : null,
    wantSum: p.recovered,
  });
}

check(
  25,
  "SSR renders the owner panel: 4 caught rows + final recovered, per preset",
  ledgerRows.length === 3 &&
    ledgerRows.every(
      (r) =>
        r.status === 200 &&
        r.rowCount === 4 &&
        r.row0HasNumber &&
        r.panelRecovered === r.wantPanelRecovered,
    ),
  ledgerRows
    .map(
      (r) =>
        `${r.path} -> HTTP ${r.status}, ${r.rowCount}/4 rows, row0 ${JSON.stringify(r.row0Text)} ` +
        `(want caller ${JSON.stringify(r.wantRow0Number)}), recovered ${JSON.stringify(r.panelRecovered)} ` +
        `(want ${JSON.stringify(r.wantPanelRecovered)})`,
    )
    .join(" | "),
);

check(
  27,
  "sum(caught[].amount) === recovered, from rendered HTML",
  ledgerRows.length === 3 && ledgerRows.every((r) => r.sum != null && r.sum === r.wantSum),
  ledgerRows.map((r) => `${r.path} -> amounts ${JSON.stringify(r.amounts)} sum ${r.sum} (want ${r.wantSum})`).join(" | "),
);

/* ---------- 12-20, 22-24, 26, 28-32: the live DOM ------------------------- */

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
  const panelRecovered = document.querySelector("[data-panel-recovered]");
  const caughtRows = [0, 1, 2, 3].map((i) => document.querySelector(`[data-caught-row="${i}"]`));
  const caughtList = caughtRows[0] ? caughtRows[0].parentElement : null;

  const vpcs = vp ? getComputedStyle(vp) : null;
  const vpr = vp ? vp.getBoundingClientRect() : null;
  const cardr = card ? card.getBoundingClientRect() : null;
  const stackr = stack ? stack.getBoundingClientRect() : null;

  return {
    panelRecovered: panelRecovered ? panelRecovered.textContent.trim() : null,
    caughtVisible: caughtRows.filter((r) => r && vis(r) > 0.5).length,
    caughtRow0Number: caughtRows[0] ? caughtRows[0].textContent.trim() : null,
    caughtListH: caughtList ? caughtList.clientHeight : null,
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

const BROWSER_GATES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 26, 28, 29, 30, 31, 32, 33, 34, 35];

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
    /* Samples at 5.5, not the spec's literal 5.0: the recovered roll is
       LEDGER_AT(4.6) + LEDGER_DUR(0.8) = settles at 5.4, so 5.0 would always
       read a mid-roll value regardless of correctness. 5.5 is unambiguously
       past settle. */
    for (const T of [0.3, 2.5, 3.0, 5.5, 6.0]) {
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

    const settled = snaps[5.5];
    check(
      26,
      "caught-row insert: 3 rows at t=0.3, all 4 once settled",
      snaps[0.3].caughtVisible === 3 &&
        settled.caughtVisible === 4 &&
        settled.caughtRow0Number != null &&
        settled.caughtRow0Number.includes(row0.number),
      `t=0.3 visible rows ${snaps[0.3].caughtVisible}/3, t=5.5 visible rows ${settled.caughtVisible}/4, ` +
        `row[0] at t=5.5 ${JSON.stringify(settled.caughtRow0Number)} (must contain ${JSON.stringify(row0.number)})`,
    );

    const finalPanelRecovered = usd(expected.recovered);
    const openingPanelRecovered = usd(expected.recovered - row0.amount);
    check(
      28,
      "panel recovered opens at (recovered - row0.amount), settles at recovered",
      snaps[0.3].panelRecovered === openingPanelRecovered && settled.panelRecovered === finalPanelRecovered,
      `t=0.3 ${JSON.stringify(snaps[0.3].panelRecovered)} (want ${JSON.stringify(openingPanelRecovered)}), ` +
        `t=5.5 ${JSON.stringify(settled.panelRecovered)} (want ${JSON.stringify(finalPanelRecovered)})`,
    );

    const listHeights = [snaps[0.3].caughtListH, snaps[3.0].caughtListH, settled.caughtListH];
    check(
      29,
      "caught list never reflows on row insert",
      listHeights.every((h) => typeof h === "number" && h > 0) &&
        listHeights[0] === listHeights[1] &&
        listHeights[1] === listHeights[2],
      `clientHeight at t=0.3/3.0/5.5 -> ${listHeights.join(" / ")}`,
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
        r.panelRecovered === usd(expected.recovered) &&
        r.caughtVisible === 4 &&
        r.replay === false &&
        r.share === true,
      `visible ${r.visible}/${expected.bubbles}, call card ${r.cardVisible}, ledger ${JSON.stringify(r.ledger)}, ` +
        `leak ${JSON.stringify(r.leak)}, panel recovered ${JSON.stringify(r.panelRecovered)}, ` +
        `caught rows visible ${r.caughtVisible}/4, replay visible ${r.replay} (need false), ` +
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
    await waitT(page, 5.8); // past CONTROLS_AT (5.4) + CONTROLS_FADE (0.3), fully visible
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

      // Whole-page tally: every [data-money] region, not just the first.
      const allMoneyRegions = [...document.querySelectorAll("[data-money]")];
      const allGold = allMoneyRegions.flatMap((r) =>
        [...r.querySelectorAll("*")].filter((el) => getComputedStyle(el).color === gold),
      );
      const panelRecoveredEl = document.querySelector("[data-panel-recovered]");

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
        moneyRegionCount: allMoneyRegions.length,
        totalGoldCount: allGold.length,
        panelRecoveredColor: panelRecoveredEl ? getComputedStyle(panelRecoveredEl).color : null,
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

    check(
      31,
      "gold across the whole page is exactly 1: the panel recovered figure",
      tokens.moneyRegionCount >= 1 &&
        tokens.totalGoldCount === 1 &&
        tokens.panelRecoveredColor === tokens.gold,
      `${tokens.moneyRegionCount} [data-money] region(s), ${tokens.totalGoldCount} gold element(s) total (need 1); ` +
        `panel recovered ${tokens.panelRecoveredColor} (must equal gold ${tokens.gold})`,
    );

    await ctx.close();
  });

  /* --- 30: at 1440x900, phone LEFT, ledger panel RIGHT, tops aligned, no overlap --- */
  await block("desktop-pair-geometry", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 5.5);

    const g = await page.evaluate(() => {
      const screen = document.querySelector("[data-phone-screen]");
      let phone = screen;
      for (let i = 0; i < 2 && phone.parentElement; i++) phone = phone.parentElement;
      const panel = document.querySelector("[data-ledger-panel]");
      if (!phone || !panel) return null;
      const pr = phone.getBoundingClientRect();
      const lr = panel.getBoundingClientRect();
      const overlap = !(pr.right <= lr.left || lr.right <= pr.left || pr.bottom <= lr.top || lr.bottom <= pr.top);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        phone: { top: pr.top, bottom: pr.bottom, left: pr.left, right: pr.right },
        ledger: { top: lr.top, bottom: lr.bottom, left: lr.left, right: lr.right },
        overlap,
        phoneInViewport: pr.left >= -0.5 && pr.right <= vw + 0.5 && pr.top >= -0.5 && pr.bottom <= vh + 0.5,
        ledgerInViewport: lr.left >= -0.5 && lr.right <= vw + 0.5 && lr.top >= -0.5 && lr.bottom <= vh + 0.5,
        topDiff: Math.abs(pr.top - lr.top),
        // Non-overlap alone doesn't establish which box is on which side —
        // a panel-left/phone-right composition would satisfy every other
        // condition here too. Require the phone's right edge to clear the
        // panel's left edge.
        phoneIsLeft: pr.right <= lr.left,
      };
    });

    check(
      30,
      "at 1440x900: phone left, ledger panel right, fully visible, tops aligned",
      g != null &&
        g.overlap === false &&
        g.phoneIsLeft === true &&
        g.phoneInViewport === true &&
        g.ledgerInViewport === true &&
        g.topDiff <= 8,
      g == null
        ? "phone or ledger panel not found"
        : `overlap ${g.overlap}, phone left of ledger ${g.phoneIsLeft}, ` +
          `phone in viewport ${g.phoneInViewport} (${JSON.stringify(g.phone)}), ` +
          `ledger in viewport ${g.ledgerInViewport} (${JSON.stringify(g.ledger)}), topDiff ${g.topDiff}px (need <= 8)`,
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
    await waitT(page, 5.6); // settled: leak (LEAK_DUR=5.4) shows the OLD preset's full total

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

  /* --- 32: the owner panel's recovered figure must never climb before it drops ---
   * Switches to "dental", not "home": home's own opening value (recovered -
   * caught[0].amount = 4250 - 850 = 3400) exceeds salon's final (1360), so ANY
   * correct switch salon->home necessarily climbs — that is real data, not an
   * artifact. dental's opening value (1800 - 600 = 1200) is genuinely below
   * salon's final, so this pair actually exercises the no-overshoot guarantee. */
  await block("switch-transition-panel", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 5.6); // settled: panel recovered shows the OLD preset's full total

    const sampled = await page.evaluate(async (presetId) => {
      const num = (s) => Number(String(s ?? "").replace(/[^0-9.-]/g, ""));
      const el = document.querySelector("[data-panel-recovered]");
      const btn = document.querySelector(`[data-preset="${presetId}"]`);
      if (!el || !btn) return null;
      const before = num(el.textContent);
      btn.click();
      const series = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 700) {
        series.push(num(el.textContent));
        await new Promise((r) => setTimeout(r, 100));
      }
      return { before, series };
    }, "dental");

    const series = sampled?.series ?? [];
    const finite = series.filter((n) => Number.isFinite(n));
    const peak = finite.length ? Math.max(...finite) : NaN;
    check(
      32,
      "panel recovered never climbs before it drops on preset switch",
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

  /* --- 33: the sub-headline must never disappear --- */
  await block("sub-headline-visible", async () => {
    const rows = [];
    for (const vp of [
      { w: 390, h: 844 },
      { w: 1024, h: 768 },
      { w: 1440, h: 900 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const el = document.querySelector("[data-sub]");
        if (!el) return null;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          display: cs.display,
          visibility: cs.visibility,
          opacity: parseFloat(cs.opacity || "1"),
          width: rect.width,
          height: rect.height,
          hasText: (el.textContent || "").trim().length > 0,
        };
      });
      rows.push({ vp: `${vp.w}x${vp.h}`, r });
      await ctx.close();
    }

    const ok = (r) =>
      r != null &&
      r.display !== "none" &&
      r.visibility !== "hidden" &&
      r.opacity > 0 &&
      r.width > 0 &&
      r.height > 0 &&
      r.hasText;

    check(
      33,
      "sub-headline (COPY.sub) is visible at 390x844, 1024x768, and 1440x900",
      rows.length === 3 && rows.every((row) => ok(row.r)),
      rows.map((row) => `${row.vp} -> ${JSON.stringify(row.r)}`).join(" | "),
    );
  });

  /* --- 34 (amended, change 6): the FULL marketing frame — header + both
   * device boxes + anything stacked in the phone column (Controls; the
   * phone-side "Lost this month" card that used to also stack there is gone
   * as of this change) — fits 1440x900 with no scroll.
   *
   * Change 5 scoped this to the device boxes alone (matching gate 30),
   * because closing the FULL-column gap was unreachable by the levers that
   * change offered (227px short, with only the phone's own height as a
   * lever). Deleting the duplicate Lost card removed most of that stacked
   * height, and change 6 explicitly asks for the fuller measurement again —
   * so this gate now covers the whole left column, not just the phone.
   */
  await block("marketing-frame-fit", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 6.0);

    const g = await page.evaluate(() => {
      const header = document.querySelector("header");
      const screen = document.querySelector("[data-phone-screen]");
      let phone = screen;
      for (let i = 0; i < 2 && phone && phone.parentElement; i++) phone = phone.parentElement;
      const controls = document.querySelector("[data-controls]");
      const panel = document.querySelector("[data-ledger-panel]");
      if (!header || !phone || !controls || !panel) return null;
      const hr = header.getBoundingClientRect();
      const pr = phone.getBoundingClientRect();
      const cr = controls.getBoundingClientRect();
      const lr = panel.getBoundingClientRect();
      return {
        headerBottom: hr.bottom,
        phoneBottom: pr.bottom,
        controlsBottom: cr.bottom,
        panelBottom: lr.bottom,
        frameBottom: Math.max(hr.bottom, pr.bottom, cr.bottom, lr.bottom),
        innerHeight: window.innerHeight,
      };
    });

    check(
      34,
      "full marketing frame (header + both device boxes + phone-column stack) fits 1440x900 with no scroll",
      g != null && g.frameBottom <= g.innerHeight,
      g == null
        ? "header, phone, controls, or ledger panel not found"
        : `frame bottom ${Math.round(g.frameBottom)}px (header ${Math.round(g.headerBottom)}px, ` +
          `phone ${Math.round(g.phoneBottom)}px, controls ${Math.round(g.controlsBottom)}px, ` +
          `panel ${Math.round(g.panelBottom)}px) vs viewport ${g.innerHeight}px (need frame bottom <= viewport)`,
    );

    await ctx.close();
  });

  /* --- 35: exactly one data-leak-lost on the page, and it lives on the owner
   * panel (change 6 deleted the phone-side duplicate). Muted, never gold. */
  await block("single-leak-figure", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 6.0);

    const g = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const toRgb = (name) => {
        const h = root.getPropertyValue(name).trim().replace("#", "");
        if (h.length < 6) return null;
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      const els = [...document.querySelectorAll("[data-leak-lost]")];
      const panel = document.querySelector("[data-ledger-panel]");
      return {
        count: els.length,
        insidePanel: els.length === 1 && panel ? panel.contains(els[0]) : false,
        color: els.length === 1 ? getComputedStyle(els[0]).color : null,
        muted: toRgb("--color-muted"),
        gold: toRgb("--color-gold"),
      };
    });

    check(
      35,
      "exactly one data-leak-lost on the page, inside the owner panel, muted not gold",
      g.count === 1 && g.count > 0 && g.insidePanel && g.color === g.muted && g.color !== g.gold,
      `${g.count} element(s) with data-leak-lost (need exactly 1, > 0), inside panel: ${g.insidePanel}, ` +
        `color ${g.color} (need muted ${g.muted}, must not be gold ${g.gold})`,
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
