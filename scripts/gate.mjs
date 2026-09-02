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
const sceneClosed = need(/closed:\s*"([^"]+)"/, "COPY.scene.closed");
const sceneDialing = need(/dialing:\s*"([^"]+)"/, "COPY.scene.dialing");
const sceneCaught = need(/caught:\s*"([^"]+)"/, "COPY.scene.caught");
const sinceLabel = need(/sinceLabel:\s*"([^"]+)"/, "COPY.ledger.sinceLabel");

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
      // First text: in the block is thread[0].text (caught entries carry
      // detail:, not text:). Gate 58 asserts the banner quotes it.
      firstText: pick(/text:\s*"([^"]+)"/, "thread[0].text"),
      ticket: Number(pick(/ticket:\s*(\d+)/, "ticket")),
      missedPerMonth: Number(pick(/missedPerMonth:\s*(\d+)/, "missedPerMonth")),
      callsCaught: Number(pick(/callsCaught:\s*(\d+)/, "callsCaught")),
      recovered: Number(pick(/recovered:\s*(\d+)/, "recovered")),
      lost: Number(pick(/lost:\s*(\d+)/, "lost")),
      sinceCalls: Number(pick(/sinceCalls:\s*(\d+)/, "sinceCalls")),
      sinceRecovered: Number(pick(/sinceRecovered:\s*(\d+)/, "sinceRecovered")),
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
 * Beats are 0 / 2.2 / 3.3 / 4.0 THREAD-RELATIVE (bubble 0 is pre-delivered —
 * the banner already announced it), so at these sample times the visible
 * bubble count is fully determined. Change 10 prepends a 4.8s
 * lock-screen opening to the global clock: every browser gate that samples
 * the thread timeline waits at (thread time + INTRO) but keeps its
 * thread-relative labels and assertions untouched. Held independently of
 * lib/timeline.ts on purpose: a gate that imported the timeline would move
 * with it and could never catch a rebeat.
 */
const INTRO = 5.6;
const VISIBLE_AT = { 0.3: 1, 2.5: 2, 6.0: expected.bubbles };

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
/* A retired gate keeps its number and prints RETIRED with the reason; it can
   never fail and never counts as coverage. */
const retired = (n, reason) => results.push({ n, name: "retired", pass: true, retired: true, detail: reason });

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

/* Change 11 retired four call-card gates: the missed-call card carried the
   owner's POV and was deleted from the thread. */
retired(16, "change 11 removed the call card; the thread box geometry it anchored no longer exists");
retired(21, "change 11 removed the call card and its callerNumber/callReason copy");
retired(22, "change 11 removed the call card; there is no node whose identity could persist");
retired(23, "change 11 removed the call card and its muted left rule");
retired(73, "change 15 (A3) replaced the settled-gated down-cue with the persistent rail chevron; COPY.cues.down retired");
retired(75, "change 15 (A1) removed the phone from mobile section 2 — there is no section-2 mobile device to compare");

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

/* 36: change 7 stripped the trailing period from every callReason, since
   Phone.tsx's call card joins it to COPY.callCard.meta with " · " — a
   surviving period would render as ". ·". Checked on plain decoded page
   text (not a specific element), across all three presets. */
const dotMiddotRows = [];
for (const p of [byId("salon"), homePreset, dentalPreset]) {
  const page = await getPage(`/?biz=${p.id}`);
  dotMiddotRows.push({ id: p.id, status: page.status, hasBad: page.text.includes(". ·") });
}
check(
  36,
  'no rendered string contains ". ·" — all three ?biz values, SSR',
  dotMiddotRows.length === 3 && dotMiddotRows.every((r) => r.status === 200 && !r.hasBad),
  dotMiddotRows.map((r) => `?biz=${r.id} -> HTTP ${r.status}, contains ". ·": ${r.hasBad}`).join(" | "),
);

/* 54: the server reads &name= itself — a shared link renders the custom name
   with no client hydration. Raw HTML, scripts stripped, so the RSC payload
   cannot satisfy this. */
{
  const page = await getPage("/?biz=home&name=Acme%20Plumbing");
  const ledgerBiz = elementsIn(page.html, "data-ledger-biz");
  const phoneBiz = elementsIn(page.html, "data-biz-name");
  check(
    54,
    "SSR of /?biz=home&name=Acme%20Plumbing renders the custom name in the ledger header",
    page.status === 200 &&
      ledgerBiz.length === 1 &&
      ledgerBiz[0] === "Acme Plumbing" &&
      phoneBiz.length === 1 &&
      phoneBiz[0] === "Acme Plumbing",
    `HTTP ${page.status}; ledger header ${JSON.stringify(ledgerBiz[0] ?? null)}, ` +
      `phone header ${JSON.stringify(phoneBiz[0] ?? null)} (both must be "Acme Plumbing")`,
  );
}

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

/* Interaction gates must not race hydration: the SSR shell carries
   data-t="settled", and a click landing before React attaches handlers is
   swallowed (or half-replayed). A numeric data-t is the engine's mount
   signal — after it, handlers are live. */
async function waitHydrated(page) {
  await page.waitForFunction(
    () => {
      const v = document.querySelector("[data-demo]")?.getAttribute("data-t");
      return v != null && v !== "settled";
    },
    undefined,
    { timeout: 30000 },
  );
}

/* Change 12: gesture-equivalents for the pager. Sections are addressed by
   index (pager scrollTop is a snap point at every section boundary), and the
   preset switcher is section 3's track — "click preset N" is now "snap the
   track to panel N". */
async function goSection(page, idx) {
  await page.evaluate((i) => {
    const pager = document.querySelector("[data-pager]");
    pager.scrollTop = i * pager.clientHeight;
  }, idx);
  await page.waitForTimeout(150);
}

async function snapTrack(page, idx) {
  await page.evaluate((i) => {
    const track = document.querySelector('[data-section="yours"] [data-track]');
    track.scrollTo({ left: i * track.clientWidth, behavior: "instant" });
  }, idx);
}

const BROWSER_GATES = [
  12, 13, 14, 15, 17, 18, 19, 20, 24, 26, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 45,
  46, 47, 48, 49, 50, 51, 52, 53, 55, 56, 57, 58, 59, 60, 61, 62, 63,
  64, 65, 66, 67, 68, 69, 70, 71, 72,
  74, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 85, 86, 87, 88, 89, 90,
  91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
  101, 102, 103, 104, 105, 106, 107, 108,
];

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
      await waitT(page, T + INTRO);
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
        r.ledger === usd(expected.recovered) &&
        r.leak === usd(expected.lost) &&
        r.panelRecovered === usd(expected.recovered) &&
        r.caughtVisible === 4 &&
        r.replay === false &&
        r.share === true,
      `visible ${r.visible}/${expected.bubbles}, ledger ${JSON.stringify(r.ledger)}, ` +
        `leak ${JSON.stringify(r.leak)}, panel recovered ${JSON.stringify(r.panelRecovered)}, ` +
        `caught rows visible ${r.caughtVisible}/4, replay visible ${r.replay} (need false), ` +
        `share visible ${r.share} (need true)`,
    );

    await ctx.close();
  });

  /* --- 18: preset switching (change 12: the switcher is section 3's track;
   * a snap landing mid-swap is QUEUED, so the page always lands wherever the
   * track rests — the URL/rendered agreement assertion is unchanged). --- */
  await block("preset-switch", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitHydrated(page);
    await goSection(page, 2);
    await snapTrack(page, 1);
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

    /* A second snap inside the swap window retargets after the roll (queued,
       change 12). The URL must agree with whatever actually ended up on
       screen — never advertise a preset the page never rendered. */
    await snapTrack(page, 2);
    await page.waitForTimeout(1600);
    const raced = await page.evaluate(sampleFn, EFF);
    const rendered = presets.find((p) => p.bizName === raced.biz?.trim());
    const urlBiz = new URL(raced.url).searchParams.get("biz");
    const agree = rendered != null && urlBiz === rendered.id;

    check(
      18,
      "preset snap re-skins, and the URL never names a preset that is not rendered",
      ok &&
        after.biz?.trim() === homePreset.bizName &&
        after.url.includes("biz=home") &&
        agree,
      `first snap -> header ${JSON.stringify(after.biz?.trim() ?? null)}, url ${after.url}; ` +
        `after a second snap inside the swap window -> header ${JSON.stringify(raced.biz?.trim() ?? null)} ` +
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
    await waitT(page, 5.8 + INTRO); // past CONTROLS_AT (5.4) + CONTROLS_FADE (0.3), fully visible
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
    await waitT(page, 6.0 + INTRO);

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

      // 38 (amended, change 9): region rule, not a minimum on-screen
      // distance. Hero region (the owner panel) must carry exactly the
      // recovered figure; the bottom band must carry exactly its math
      // numerals; nothing gold may exist outside either region.
      const isGold = (el) => getComputedStyle(el).color === gold;
      const heroContainer = document.querySelector("[data-ledger-panel]");
      const bandContainer = document.querySelector("[data-bottom-band]");
      const heroGold = heroContainer ? [...heroContainer.querySelectorAll("*")].filter(isGold) : [];
      const bandGold = bandContainer ? [...bandContainer.querySelectorAll("*")].filter(isGold) : [];
      const pageGold = [...document.querySelectorAll("*")].filter(isGold);
      const numerals = [...document.querySelectorAll("[data-math-numeral]")];
      /* Change 12 (B3): section 3's preset panels carry their ticket in gold
         — a third sanctioned region. Everything gold there must be a
         data-ticket element. */
      const yoursContainer = document.querySelector('[data-section="yours"]');
      const yoursGold = yoursContainer ? [...yoursContainer.querySelectorAll("*")].filter(isGold) : [];
      const tickets = [...document.querySelectorAll("[data-ticket]")];

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
        heroGoldCount: heroGold.length,
        heroGoldIsRecovered: heroGold.length === 1 && heroGold[0].hasAttribute("data-panel-recovered"),
        bandGoldCount: bandGold.length,
        bandGoldIsNumerals:
          bandGold.length === numerals.length &&
          numerals.length > 0 &&
          bandGold.every((el) => el.hasAttribute("data-math-numeral")),
        numeralCount: numerals.length,
        yoursGoldCount: yoursGold.length,
        yoursGoldIsTickets:
          yoursGold.length === tickets.length &&
          tickets.length > 0 &&
          yoursGold.every((el) => el.hasAttribute("data-ticket")),
        ticketCount: tickets.length,
        pageGoldCount: pageGold.length,
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
      31,
      "gold across the whole page is exactly 1: the panel recovered figure",
      tokens.moneyRegionCount >= 1 &&
        tokens.totalGoldCount === 1 &&
        tokens.panelRecoveredColor === tokens.gold,
      `${tokens.moneyRegionCount} [data-money] region(s), ${tokens.totalGoldCount} gold element(s) total (need 1); ` +
        `panel recovered ${tokens.panelRecoveredColor} (must equal gold ${tokens.gold})`,
    );

    /* Amended (change 12): a THIRD gold region — the section-3 preset track,
       whose per-panel ticket figures the spec sets in gold. The rule's shape
       is unchanged: every region carries exactly its own money figures, and
       nothing gold exists outside the sanctioned regions. */
    check(
      38,
      "gold is region-scoped: the recovered figure in the hero panel, the math numerals in the band, the ticket figures in the preset track, nothing gold elsewhere",
      tokens.heroGoldCount === 1 &&
        tokens.heroGoldIsRecovered &&
        tokens.bandGoldCount === tokens.numeralCount &&
        tokens.numeralCount > 0 &&
        tokens.bandGoldIsNumerals &&
        tokens.yoursGoldCount === tokens.ticketCount &&
        tokens.ticketCount > 0 &&
        tokens.yoursGoldIsTickets &&
        tokens.pageGoldCount === tokens.heroGoldCount + tokens.bandGoldCount + tokens.yoursGoldCount,
      `hero panel: ${tokens.heroGoldCount} gold (need 1, on data-panel-recovered: ${tokens.heroGoldIsRecovered}); ` +
        `band: ${tokens.bandGoldCount} gold vs ${tokens.numeralCount} data-math-numeral (all gold: ${tokens.bandGoldIsNumerals}); ` +
        `preset track: ${tokens.yoursGoldCount} gold vs ${tokens.ticketCount} data-ticket (all gold: ${tokens.yoursGoldIsTickets}); ` +
        `page-wide: ${tokens.pageGoldCount} gold total (must equal hero + band + track)`,
    );

    /* 82 (change 13): the section-3 tiles carry exactly ONE gold element per
       panel — the ticket value — and the page census stays at 6. */
    check(
      82,
      "section-3 gold is only the ticket value (1 per panel, 3 total); page-wide gold census is exactly 6",
      tokens.ticketCount === presets.length &&
        tokens.yoursGoldCount === presets.length &&
        tokens.yoursGoldIsTickets &&
        tokens.pageGoldCount === 6,
      `${tokens.yoursGoldCount} gold element(s) in section 3 vs ${tokens.ticketCount} data-ticket ` +
        `(need ${presets.length} each, all on data-ticket: ${tokens.yoursGoldIsTickets}); ` +
        `page-wide gold ${tokens.pageGoldCount} (need exactly 6)`,
    );

    await ctx.close();
  });

  /* --- 30 (amended, change 13): section 2 is a 40/60 two-up whose LEFT
   * column stacks headline-then-phone, the phone bleeding off the section
   * bottom BY DESIGN (S2a) — so "fully visible" and "tops aligned" now apply
   * to the ledger only. Kept: no overlap, phone strictly left, ledger fully
   * visible, phone anchored inside the frame horizontally and at its top. */
  await block("desktop-pair-geometry", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 5.5 + INTRO);
    await goSection(page, 1);

    const g = await page.evaluate(() => {
      const phone = document.querySelector('[data-section="save"] [data-phone-device]');
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
        /* change 14 restores the bottom-containment clause: the change-13
           bleed is corrected — the whole device sits inside the frame. */
        phoneInViewport: pr.left >= -0.5 && pr.right <= vw + 0.5 && pr.top >= -0.5 && pr.bottom <= vh + 0.5,
        ledgerInViewport: lr.left >= -0.5 && lr.right <= vw + 0.5 && lr.top >= -0.5 && lr.bottom <= vh + 0.5,
        phoneIsLeft: pr.right <= lr.left,
      };
    });

    check(
      30,
      "section 2 at 1440x900: phone column left of the ledger, no overlap, phone AND ledger fully visible",
      g != null &&
        g.overlap === false &&
        g.phoneIsLeft === true &&
        g.phoneInViewport === true &&
        g.ledgerInViewport === true,
      g == null
        ? "phone or ledger panel not found"
        : `overlap ${g.overlap}, phone left of ledger ${g.phoneIsLeft}, ` +
          `phone in viewport ${g.phoneInViewport} (${JSON.stringify(g.phone)}), ` +
          `ledger in viewport ${g.ledgerInViewport} (${JSON.stringify(g.ledger)})`,
    );

    await ctx.close();
  });

  /* --- 24: the switch must never climb before it drops --- */
  await block("switch-transition", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 5.6 + INTRO); // settled: leak (LEAK_DUR=5.4) shows the OLD preset's full total

    await goSection(page, 2);
    const sampled = await page.evaluate(async (panelIdx) => {
      const num = (s) => Number(String(s ?? "").replace(/[^0-9.-]/g, ""));
      const leakEl = document.querySelector("[data-leak-lost]");
      const track = document.querySelector('[data-section="yours"] [data-track]');
      if (!leakEl || !track) return null;
      const before = num(leakEl.textContent);
      track.scrollTo({ left: panelIdx * track.clientWidth, behavior: "instant" });
      const series = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 700) {
        series.push(num(leakEl.textContent));
        await new Promise((r) => setTimeout(r, 100));
      }
      return { before, series };
    }, 1); // panel 1 = "home"

    const series = sampled?.series ?? [];
    const finite = series.filter((n) => Number.isFinite(n));
    const peak = finite.length ? Math.max(...finite) : NaN;
    check(
      24,
      "preset switch (track snap) never climbs before it drops",
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
    await waitT(page, 5.6 + INTRO); // settled: panel recovered shows the OLD preset's full total

    await goSection(page, 2);
    const sampled = await page.evaluate(async (panelIdx) => {
      const num = (s) => Number(String(s ?? "").replace(/[^0-9.-]/g, ""));
      const el = document.querySelector("[data-panel-recovered]");
      const track = document.querySelector('[data-section="yours"] [data-track]');
      if (!el || !track) return null;
      const before = num(el.textContent);
      track.scrollTo({ left: panelIdx * track.clientWidth, behavior: "instant" });
      const series = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 700) {
        series.push(num(el.textContent));
        await new Promise((r) => setTimeout(r, 100));
      }
      return { before, series };
    }, 2); // panel 2 = "dental"


    const series = sampled?.series ?? [];
    const finite = series.filter((n) => Number.isFinite(n));
    const peak = finite.length ? Math.max(...finite) : NaN;
    check(
      32,
      "panel recovered never climbs before it drops on preset switch (track snap)",
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
      /* Change 10: the headline block lands at t=3.6 (gate 49/50 cover the
         choreography); this gate's own claim — the sub-headline is visible —
         is sampled once the landing completes. */
      await waitT(page, 4.5);
      const r = await page.evaluate(() => {
        /* change 14: the sub is one string, two mounts (mobile left column /
           desktop right column) — the visible one carries the claim. */
        const els = [...document.querySelectorAll("[data-sub]")];
        if (els.length === 0) return null;
        const states = els.map((el) => {
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
        return (
          states.find(
            (st) =>
              st.display !== "none" && st.visibility !== "hidden" && st.opacity > 0 && st.width > 0 && st.height > 0,
          ) ?? states[0]
        );
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

  /* --- 34 (amended, change 13): the hero frame is still section 2, but the
   * full-scale phone now bleeds off the section bottom by design (S2a) — it
   * is excluded from the bottom fit and must only anchor its TOP inside the
   * frame. Headline, ledger panel, docked card, and Share must all fit. */
  await block("marketing-frame-fit", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 6.0 + INTRO);
    await goSection(page, 1);

    const g = await page.evaluate(() => {
      const header = document.querySelector('[data-section="save"] [data-headline]');
      const phone = document.querySelector('[data-section="save"] [data-phone-device]');
      const panel = document.querySelector("[data-ledger-panel]");
      const card = document.querySelector("[data-notify-ledger]");
      const share = document.querySelector("[data-share]");
      if (!header || !phone || !panel || !card || !share) return null;
      const hr = header.getBoundingClientRect();
      const lr = panel.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const sr = share.getBoundingClientRect();
      const phr = phone.getBoundingClientRect();
      return {
        headerBottom: hr.bottom,
        panelBottom: lr.bottom,
        shareBottom: sr.bottom,
        cardTop: cr.top,
        phoneTop: phr.top,
        phoneBottom: phr.bottom,
        /* change 14 restores the phone-inclusive fit: everything in the
           frame — the device included — fits the viewport. */
        frameBottom: Math.max(hr.bottom, lr.bottom, sr.bottom, phr.bottom),
        innerHeight: window.innerHeight,
      };
    });

    check(
      34,
      "desktop hero section 2 (headline + phone + ledger panel + docked card + share) fits 1440x900 with no scroll",
      g != null && g.frameBottom <= g.innerHeight && g.cardTop >= 0 && g.phoneTop >= 0,
      g == null
        ? "headline, phone, ledger panel, card, or share not found"
        : `frame bottom ${Math.round(g.frameBottom)}px (header ${Math.round(g.headerBottom)}px, ` +
          `phone ${Math.round(g.phoneBottom)}px, panel ${Math.round(g.panelBottom)}px, share ${Math.round(g.shareBottom)}px) ` +
          `vs viewport ${g.innerHeight}px; card top ${Math.round(g.cardTop)}px, phone top ${Math.round(g.phoneTop)}px (both >= 0)`,
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
    await waitT(page, 6.0 + INTRO);

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

  /* --- 37: since-install strip renders sinceCalls + sinceRecovered per
   * preset, and its dollar figure is not gold. calls/recovered text is SSR
   * content (present at domcontentloaded, no animation involved) — only the
   * colour check genuinely needs a computed style, so this stays a browser
   * gate rather than a plain fetch. */
  await block("since-strip", async () => {
    const rows = [];
    for (const p of [byId("salon"), homePreset, dentalPreset]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${base}/?biz=${p.id}`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);

      const r = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const toRgb = (name) => {
          const h = root.getPropertyValue(name).trim().replace("#", "");
          if (h.length < 6) return null;
          return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
        };
        const calls = document.querySelector("[data-since-calls]");
        const recovered = document.querySelector("[data-since-recovered]");
        return {
          calls: calls ? calls.textContent.trim() : null,
          recoveredText: recovered ? recovered.textContent.trim() : null,
          recoveredColor: recovered ? getComputedStyle(recovered).color : null,
          gold: toRgb("--color-gold"),
        };
      });

      rows.push({
        id: p.id,
        calls: r.calls,
        wantCalls: String(p.sinceCalls),
        recoveredText: r.recoveredText,
        wantRecovered: usd(p.sinceRecovered),
        recoveredColor: r.recoveredColor,
        gold: r.gold,
      });
      await ctx.close();
    }

    check(
      37,
      "since-install strip renders sinceCalls + sinceRecovered per preset (SSR); dollar figure is not gold",
      rows.length === 3 &&
        rows.every(
          (r) =>
            r.calls != null &&
            r.calls === r.wantCalls &&
            r.recoveredText === r.wantRecovered &&
            r.recoveredColor != null &&
            r.recoveredColor !== r.gold,
        ),
      rows
        .map(
          (r) =>
            `?biz=${r.id} -> calls ${JSON.stringify(r.calls)} (want ${r.wantCalls}), ` +
            `recovered ${JSON.stringify(r.recoveredText)} (want ${r.wantRecovered}), ` +
            `colour ${r.recoveredColor} (must not be gold ${r.gold})`,
        )
        .join(" | "),
    );
  });

  /* --- 39: caught row [0] carries the teal left rule and a background
   * distinct from rows 1-3, which must carry neither. */
  await block("caught-row0-highlight", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitT(page, 6.0 + INTRO);

    const g = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const toRgb = (name) => {
        const h = root.getPropertyValue(name).trim().replace("#", "");
        if (h.length < 6) return null;
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      const rows = [0, 1, 2, 3].map((i) => document.querySelector(`[data-caught-row="${i}"]`));
      if (rows.some((r) => !r)) return null;
      const styles = rows.map((r) => getComputedStyle(r));
      return {
        teal: toRgb("--color-teal"),
        ruleColors: styles.map((s) => s.borderLeftColor),
        ruleWidths: styles.map((s) => s.borderLeftWidth),
        bgColors: styles.map((s) => s.backgroundColor),
      };
    });

    const row0RuleOk = g != null && g.ruleColors[0] === g.teal && parseFloat(g.ruleWidths[0]) >= 2;
    const restNoRuleOk =
      g != null &&
      g.ruleColors.slice(1).every((c, i) => !(c === g.teal && parseFloat(g.ruleWidths[i + 1]) > 0));
    const restBgMatchOk = g != null && g.bgColors[1] === g.bgColors[2] && g.bgColors[2] === g.bgColors[3];
    const row0BgDiffersOk = g != null && g.bgColors[0] != null && g.bgColors[0] !== g.bgColors[1];

    check(
      39,
      "row[0] left rule is teal (rows 1-3 have none), row[0] background differs from rows 1-3",
      row0RuleOk && restNoRuleOk && restBgMatchOk && row0BgDiffersOk,
      g == null
        ? "one or more caught rows not found"
        : `rule colours ${JSON.stringify(g.ruleColors)} @ widths ${JSON.stringify(g.ruleWidths)} ` +
          `(row0 must equal teal ${g.teal} at >=2px; rows 1-3 must not), ` +
          `bg colours ${JSON.stringify(g.bgColors)} (rows 1-3 must match each other, row0 must differ)`,
    );

    await ctx.close();
  });

  /* --- 45: math-line numerals carry gold at both viewports. Unchanged from
   * change 8 — gate 38 (region rule now, not a window rule) moved into the
   * colour-tokens block above since region membership is DOM-structural and
   * doesn't need multi-viewport bounding-box math. */
  await block("math-numeral-gold", async () => {
    const rows = [];
    for (const vp of [
      { w: 1440, h: 900 },
      { w: 390, h: 844 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await waitT(page, 6.0 + INTRO);

      const g = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const toRgb = (name) => {
          const h = root.getPropertyValue(name).trim().replace("#", "");
          if (h.length < 6) return null;
          return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
        };
        const gold = toRgb("--color-gold");
        const numerals = [...document.querySelectorAll("[data-math-numeral]")];
        return {
          gold,
          numeralCount: numerals.length,
          numeralColors: numerals.map((el) => getComputedStyle(el).color),
        };
      });

      rows.push({
        vp: `${vp.w}x${vp.h}`,
        numeralCount: g.numeralCount,
        numeralColors: g.numeralColors,
        numeralsGold: g.numeralCount === 2 && g.numeralColors.every((c) => c === g.gold),
      });
      await ctx.close();
    }

    check(
      45,
      "math-line numerals computed color === gold at 1440x900 and 390x844",
      rows.length === 2 && rows.every((r) => r.numeralsGold),
      rows
        .map((r) => `${r.vp} -> ${r.numeralCount} numeral(s) (need 2), colours ${JSON.stringify(r.numeralColors)}`)
        .join(" | "),
    );
  });

  /* --- 46 + 47: device fidelity — 19.5:9 box, system stack inside the
   * screen, Fraunces outside it. --- */
  await block("device-fidelity", async () => {
    const rows = [];
    for (const vp of [
      { w: 390, h: 844 },
      { w: 1440, h: 900 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      const g = await page.evaluate(() => {
        const device = document.querySelector("[data-phone-device]");
        const bizName = document.querySelector("[data-biz-name]");
        const h1 = document.querySelector("h1");
        if (!device) return null;
        const r = device.getBoundingClientRect();
        return {
          w: r.width,
          h: r.height,
          ratio: r.width > 0 ? r.height / r.width : NaN,
          screenFont: bizName ? getComputedStyle(bizName).fontFamily : null,
          headlineFont: h1 ? getComputedStyle(h1).fontFamily : null,
        };
      });
      rows.push({ vp: `${vp.w}x${vp.h}`, g });
      await ctx.close();
    }

    const TARGET = 19.5 / 9;
    const aspectOk = (g) =>
      g != null && Number.isFinite(g.ratio) && g.ratio > 0 && Math.abs(g.ratio - TARGET) / TARGET <= 0.01;
    check(
      46,
      "phone box aspect 19.5:9 within 1% at 390x844 and 1440x900",
      rows.length === 2 && rows.every((r) => aspectOk(r.g)),
      rows
        .map(
          (r) =>
            `${r.vp} -> ${r.g ? `${r.g.w.toFixed(1)}x${r.g.h.toFixed(1)} ratio ${r.g.ratio?.toFixed(4)}` : "device not found"} ` +
            `(target ${TARGET.toFixed(4)} ±1%)`,
        )
        .join(" | "),
    );

    const fontsOk = (g) =>
      g != null &&
      g.screenFont != null &&
      (g.screenFont.includes("-apple-system") || g.screenFont.includes("Segoe UI")) &&
      !g.screenFont.includes("Inter") &&
      g.headlineFont != null &&
      g.headlineFont.includes("Fraunces");
    check(
      47,
      "screen font resolves to the system stack (not Inter); headline resolves to Fraunces",
      rows.length === 2 && rows.every((r) => fontsOk(r.g)),
      rows
        .map(
          (r) =>
            `${r.vp} -> screen ${JSON.stringify(r.g?.screenFont ?? null)}, headline ${JSON.stringify(r.g?.headlineFont ?? null)}`,
        )
        .join(" | "),
    );
  });

  /* --- 48: landscape coarse-pointer devices get only the rotate card. --- */
  await block("rotate-guard", async () => {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    const g = await page.evaluate(() => {
      const guard = document.querySelector("[data-rotate-guard]");
      const screen = document.querySelector("[data-phone-screen]");
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const guardCs = guard ? getComputedStyle(guard) : null;
      return {
        coarse,
        guardDisplay: guardCs ? guardCs.display : null,
        guardHasText: guard ? (guard.textContent || "").trim().length > 0 : false,
        phoneRendered: screen ? screen.offsetParent != null : false,
      };
    });

    check(
      48,
      "landscape 844x390 coarse: rotate card visible, phone not rendered",
      g.coarse === true && g.guardDisplay === "flex" && g.guardHasText && g.phoneRendered === false,
      `pointer coarse ${g.coarse}; rotate card display ${JSON.stringify(g.guardDisplay)} (need "flex"), ` +
        `has text ${g.guardHasText}; phone rendered ${g.phoneRendered} (need false)`,
    );
    await ctx.close();
  });

  /* --- 49 + 50: the lock-screen choreography. Global-clock samples: at 0.5
   * the call is ringing (thread and headline must not exist visually); at
   * 4.0 the miss has landed and the headline has landed with it. --- */
  await block("call-choreography", async () => {
    /* 49 runs at BOTH widths: the call-screen assertions are identical. The
       headline is static content in section 2 (change 12): it must exist,
       must NOT live inside section 1, and is visible from load. */
    const rows = [];
    for (const vp of [
      { w: 390, h: 844 },
      { w: 1440, h: 900 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);

      await waitT(page, 0.5);
      const early = await page.evaluate((EFF) => {
        const vis = eval(EFF);
        const call = document.querySelector("[data-call]");
        const status = document.querySelector("[data-call-status]");
        const callBiz = document.querySelector("[data-call-biz]");
        const endBtn = document.querySelector("[data-call-end]");
        const bubbles = [...document.querySelectorAll("[data-bubble]")];
        const headline = document.querySelector("[data-headline]");
        const callSection = document.querySelector('[data-section="call"]');
        const callText = call ? call.textContent : "";
        return {
          t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
          callVisible: call ? vis(call) > 0.5 : false,
          statusText: status ? status.textContent.trim() : null,
          callBizText: callBiz ? callBiz.textContent.trim() : null,
          endVisible: endBtn ? vis(endBtn) > 0.5 : false,
          hasDecline: callText.includes("Decline"),
          hasAccept: callText.includes("Accept"),
          visibleBubbles: bubbles.filter((b) => vis(b) > 0.5).length,
          bubbleCount: bubbles.length,
          headlinePresent: headline != null,
          headlineInCallSection: headline != null && callSection != null && callSection.contains(headline),
          headlineOpacity: headline ? vis(headline) : null,
        };
      }, EFF);
      rows.push({ vp: `${vp.w}x${vp.h}`, ...early });
      await ctx.close();
    }

    check(
      49,
      "at t=0.5: callingLabel + bizName on the call screen, End present, no Decline/Accept, thread not rendered; headline exists outside section 1 (both viewports)",
      rows.length === 2 &&
        rows.every(
          (r) =>
            r.callVisible === true &&
            r.statusText != null &&
            r.statusText.startsWith("calling") &&
            r.callBizText === expected.bizName &&
            r.endVisible === true &&
            r.hasDecline === false &&
            r.hasAccept === false &&
            r.bubbleCount > 0 &&
            r.visibleBubbles === 0 &&
            r.headlinePresent === true &&
            r.headlineInCallSection === false &&
            r.headlineOpacity != null &&
            r.headlineOpacity > 0.5,
        ),
      rows
        .map(
          (r) =>
            `${r.vp} t=${r.t}: call visible ${r.callVisible}, status ${JSON.stringify(r.statusText)} (must start "calling"), ` +
            `bizName ${JSON.stringify(r.callBizText)} (want ${JSON.stringify(expected.bizName)}), End ${r.endVisible}, ` +
            `Decline ${r.hasDecline}/Accept ${r.hasAccept} (need false), bubbles ${r.visibleBubbles}/${r.bubbleCount} visible (need 0 of > 0), ` +
            `headline present ${r.headlinePresent}, inside section 1 ${r.headlineInCallSection} (need false), opacity ${r.headlineOpacity}`,
        )
        .join(" | "),
    );

    /* 50 at 390: the call has died. (The headline is static section-2
       content now — gate 49 covers where it lives.) */
    const ctx50 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page50 = await ctx50.newPage();
    await page50.goto(base, { waitUntil: "domcontentloaded" });
    await page50.evaluate(() => document.fonts.ready);
    await waitT(page50, 4.0);
    const ended = await page50.evaluate((EFF) => {
      const vis = eval(EFF);
      const status = document.querySelector("[data-call-status]");
      const headline = document.querySelector("[data-headline]");
      return {
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
        statusVisible: status ? vis(status) > 0.5 : false,
        statusText: status ? status.textContent.trim() : null,
        headlineVisible: headline ? vis(headline) > 0.5 : false,
      };
    }, EFF);

    check(
      50,
      "at t=4.0: endedLabel visible on the dimmed call screen",
      ended.statusVisible === true && ended.statusText === "Call Ended",
      `t=${ended.t}: status visible ${ended.statusVisible}, text ${JSON.stringify(ended.statusText)} ` +
        `(must be "Call Ended")`,
    );

    await ctx50.close();
  });

  /* --- 51 + 52: the two-sided moment — the owner notification. --- */
  await block("owner-notification", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    await waitT(page, 10.3);
    const at95 = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const screen = document.querySelector("[data-phone-screen]");
      const phoneCard = document.querySelector("[data-notify-phone]");
      const ledgerCard = document.querySelector("[data-notify-ledger]");
      const panel = document.querySelector("[data-ledger-panel]");
      const sr = screen ? screen.getBoundingClientRect() : null;
      const pr = phoneCard ? phoneCard.getBoundingClientRect() : null;
      const lr = ledgerCard ? ledgerCard.getBoundingClientRect() : null;
      const nr = panel ? panel.getBoundingClientRect() : null;
      const inside = (a, b) =>
        a && b && a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      /* Change 11 (step 5): the ledger card rests fully ABOVE the panel,
         docked at its top edge — horizontally within the panel's span,
         bottom at/above the panel top, and close to it. */
      const dockedAbove = (a, b) =>
        a && b && a.left >= b.left - 1 && a.right <= b.right + 1 && a.bottom <= b.top + 1 && b.top - a.bottom <= 32;
      return {
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
        phoneCardVisible: phoneCard ? vis(phoneCard) > 0.5 : false,
        phoneCardInsideScreen: inside(pr, sr),
        phoneCardText: phoneCard ? phoneCard.textContent.trim() : null,
        ledgerCardVisible: ledgerCard ? vis(ledgerCard) > 0.5 : false,
        ledgerCardOnPanel: dockedAbove(lr, nr),
      };
    }, EFF);

    await waitT(page, 13.3);
    const at125 = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const phoneCard = document.querySelector("[data-notify-phone]");
      return {
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
        phoneCardVisible: phoneCard ? vis(phoneCard) > 0.5 : false,
      };
    }, EFF);

    check(
      51,
      "at t=10.3: notification card visible inside the phone screen with bizName and caught[0].amount; gone by t=13.3",
      at95.phoneCardVisible === true &&
        at95.phoneCardInsideScreen === true &&
        at95.phoneCardText != null &&
        at95.phoneCardText.includes(expected.bizName) &&
        at95.phoneCardText.includes(`$${row0.amount}`) &&
        at125.phoneCardVisible === false,
      `t=${at95.t}: visible ${at95.phoneCardVisible}, inside screen ${at95.phoneCardInsideScreen}, ` +
        `text ${JSON.stringify(at95.phoneCardText)} (must contain ${JSON.stringify(expected.bizName)} and "$${row0.amount}"); ` +
        `t=${at125.t}: visible ${at125.phoneCardVisible} (need false)`,
    );

    check(
      52,
      "desktop 1440x900 at t=10.3: a notification card is ALSO visible, docked at the ledger panel's top edge",
      at95.ledgerCardVisible === true && at95.ledgerCardOnPanel === true,
      `ledger card visible ${at95.ledgerCardVisible}, docked above the panel ${at95.ledgerCardOnPanel}`,
    );

    await ctx.close();
  });

  /* --- 53 + 55 + 56: the live name field. --- */
  await block("name-field", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitHydrated(page);

    await page.fill("[data-name-input]", "Test Salon");
    await page.waitForTimeout(300);
    const named = await page.evaluate(() => ({
      phoneHeader: document.querySelector("[data-biz-name]")?.textContent?.trim() ?? null,
      callScreen: document.querySelector("[data-call-biz]")?.textContent?.trim() ?? null,
      notifyText: document.querySelector("[data-notify-phone]")?.textContent?.trim() ?? null,
      ledgerHeader: document.querySelector("[data-ledger-biz]")?.textContent?.trim() ?? null,
      url: location.href,
    }));

    check(
      53,
      'typing "Test Salon" re-skins the phone header, call screen, notification template, and ledger header within 300ms; URL carries name=Test%20Salon',
      named.phoneHeader === "Test Salon" &&
        named.callScreen === "Test Salon" &&
        named.notifyText != null &&
        named.notifyText.includes("Test Salon") &&
        named.ledgerHeader === "Test Salon" &&
        named.url.includes("name=Test%20Salon"),
      `phone header ${JSON.stringify(named.phoneHeader)}, call screen ${JSON.stringify(named.callScreen)}, notify contains "Test Salon": ` +
        `${named.notifyText != null && named.notifyText.includes("Test Salon")}, ledger header ` +
        `${JSON.stringify(named.ledgerHeader)}, url ${named.url}`,
    );

    /* 78 (change 13): the section-3 live-skin phone — the active panel's
       contact header carries the typed name within the same 300ms window. */
    const cropBiz = await page.evaluate(
      (id) => document.querySelector(`[data-crop-biz="${id}"]`)?.textContent?.trim() ?? null,
      expected.id,
    );
    check(
      78,
      'section 3 panel 0: the live-skin phone\'s contact header updates to "Test Salon" within 300ms of typing',
      cropBiz === "Test Salon",
      `[data-crop-biz="${expected.id}"] text ${JSON.stringify(cropBiz)} (need "Test Salon")`,
    );

    await page.fill("[data-name-input]", "<b>x</b>");
    await page.waitForTimeout(300);
    const escaped = await page.evaluate(() => {
      const header = document.querySelector("[data-biz-name]");
      const ledger = document.querySelector("[data-ledger-biz]");
      return {
        headerText: header?.textContent ?? null,
        headerInjected: header ? header.querySelector("b") != null : null,
        ledgerText: ledger?.textContent ?? null,
        ledgerInjected: ledger ? ledger.querySelector("b") != null : null,
      };
    });

    check(
      55,
      'name input "<b>x</b>" renders literally — no element injected',
      escaped.headerText === "<b>x</b>" &&
        escaped.headerInjected === false &&
        escaped.ledgerText === "<b>x</b>" &&
        escaped.ledgerInjected === false,
      `phone header text ${JSON.stringify(escaped.headerText)} (injected <b>: ${escaped.headerInjected}), ` +
        `ledger text ${JSON.stringify(escaped.ledgerText)} (injected <b>: ${escaped.ledgerInjected})`,
    );

    /* 56: a preset snap clears the field and resets to the call screen
       (change 12: the clock re-arms parked at t=0 — it runs again when the
       user returns to section 1). */
    await page.fill("[data-name-input]", "Test Salon");
    await page.waitForTimeout(300);
    await snapTrack(page, 1);
    await page.waitForTimeout(200);
    const afterClick = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const input = document.querySelector("[data-name-input]");
      const call = document.querySelector("[data-call]");
      return {
        inputValue: input ? input.value : null,
        lockVisible: call ? vis(call) > 0.5 : false,
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
      };
    }, EFF);

    const tOk =
      afterClick.t === "swap" || (Number.isFinite(parseFloat(afterClick.t)) && parseFloat(afterClick.t) < 2);
    check(
      56,
      "preset snap after typing clears the field and resets to the call screen within 200ms",
      afterClick.inputValue === "" && afterClick.lockVisible === true && tOk,
      `input value ${JSON.stringify(afterClick.inputValue)} (need ""), call screen visible ${afterClick.lockVisible}, ` +
        `data-t ${JSON.stringify(afterClick.t)} (need "swap" or < 2)`,
    );

    await ctx.close();
  });

  /* --- 57: the first frame on a phone — the device fully inside 390x844,
   * nothing above it but the page padding. --- */
  await block("first-frame-fit", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    const g = await page.evaluate(() => {
      const device = document.querySelector("[data-phone-device]");
      if (!device) return null;
      const r = device.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    /* Amended (change 12): section 1 CENTERS the phone at the largest size
       that fits with 24px margins — "top <= 32px" belonged to the scrolling
       page. Amended again (change 16, B1): the right margin is the 56px
       rail gutter now, and the device centers in the guttered content
       column, not the viewport. The claim kept: fully inside the first
       frame, nothing under the rail. */
    check(
      57,
      "first load 390x844: phone device fully within the viewport, left margin >= 24px, right margin >= 56px (rail gutter), centered in the content column",
      g != null &&
        g.top >= 23.5 &&
        g.bottom <= g.vh - 23.5 + 0.5 &&
        g.left >= 23.5 &&
        g.right <= g.vw - 55.5 &&
        Math.abs((g.left - 24) - (g.vw - 56 - g.right)) <= 2,
      g == null
        ? "device not found"
        : `device top ${g.top.toFixed(1)}, bottom ${g.bottom.toFixed(1)}, left ${g.left.toFixed(1)}, ` +
          `right ${g.right.toFixed(1)} (viewport ${g.vw}x${g.vh}; need left >= 24, right clear of the 56px gutter, centered in the column)`,
    );
    await ctx.close();
  });

  /* --- 58 + 59: the banner beat, and the thread it hands off to. --- */
  await block("banner-beat", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    await waitT(page, 4.8);
    const atBanner = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const banner = document.querySelector("[data-banner]");
      const call = document.querySelector("[data-call]");
      return {
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
        bannerVisible: banner ? vis(banner) > 0.5 : false,
        bannerText: banner ? banner.textContent.trim() : null,
        callVisible: call ? vis(call) > 0.5 : false,
      };
    }, EFF);

    check(
      58,
      "at t=4.8: banner visible over the call screen with bizName + the first 40 chars of thread[0].text; call screen still rendered beneath",
      atBanner.bannerVisible === true &&
        atBanner.bannerText != null &&
        atBanner.bannerText.includes(expected.bizName) &&
        atBanner.bannerText.includes(expected.firstText.slice(0, 40)) &&
        atBanner.callVisible === true,
      `t=${atBanner.t}: banner visible ${atBanner.bannerVisible}, text ${JSON.stringify(atBanner.bannerText)} ` +
        `(must contain ${JSON.stringify(expected.bizName)} and ${JSON.stringify(expected.firstText.slice(0, 40))}); ` +
        `call screen visible ${atBanner.callVisible} (need true)`,
    );

    await waitT(page, 6.5);
    const atThread = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const banner = document.querySelector("[data-banner]");
      const call = document.querySelector("[data-call]");
      const threadArea = document.querySelector("[data-thread-area]");
      return {
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
        bannerVisible: banner ? vis(banner) > 0.5 : false,
        callVisible: call ? vis(call) > 0 : false,
        threadVisible: threadArea ? vis(threadArea) > 0.5 : false,
        callCardInDom: document.querySelector("[data-call-card]") != null,
      };
    }, EFF);

    check(
      59,
      "at t=6.5: banner gone, thread rendered, no call-card element in the DOM",
      atThread.bannerVisible === false &&
        atThread.callVisible === false &&
        atThread.threadVisible === true &&
        atThread.callCardInDom === false,
      `t=${atThread.t}: banner visible ${atThread.bannerVisible} (need false), call screen visible ${atThread.callVisible} ` +
        `(need false), thread area visible ${atThread.threadVisible} (need true), ` +
        `call-card element in DOM ${atThread.callCardInDom} (need false)`,
    );

    await ctx.close();
  });

  /* --- 60-63: desktop composition + production DOM hygiene. One context. --- */
  await block("desktop-composition", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    await waitT(page, 10.3);
    const notif = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const card = document.querySelector("[data-notify-ledger]");
      const contents = [...document.querySelectorAll("[data-panel-content]")];
      const panel = document.querySelector("[data-ledger-panel]");
      if (!card || !panel || contents.length === 0) return null;
      const cr = card.getBoundingClientRect();
      const intersects = (a, b) =>
        !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const overlaps = contents.some((el) => intersects(cr, el.getBoundingClientRect()));
      const panelTop = panel.getBoundingClientRect().top;
      return {
        t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
        visible: vis(card) > 0.5,
        overlaps,
        gap: panelTop - cr.bottom,
        contentCount: contents.length,
      };
    }, EFF);

    check(
      60,
      "desktop t=10.3: ledger notification never intersects [data-panel-content]; bottom edge within 16px above the panel top",
      notif != null &&
        notif.visible === true &&
        notif.overlaps === false &&
        notif.gap >= 0 &&
        notif.gap <= 16,
      notif == null
        ? "notification card, panel, or panel content not found"
        : `t=${notif.t}: visible ${notif.visible}, overlaps any of ${notif.contentCount} [data-panel-content] ${notif.overlaps} ` +
          `(need false), gap panelTop - cardBottom ${notif.gap.toFixed(1)}px (need 0..16)`,
    );

    const layout = await page.evaluate(() => {
      const device = document.querySelector("[data-phone-device]");
      const input = document.querySelector("[data-name-input]");
      const track = document.querySelector('[data-section="yours"] [data-track]');
      if (!device || !input || !track) return null;
      const dr = device.getBoundingClientRect();
      const ir = input.getBoundingClientRect();
      const tr = track.getBoundingClientRect();
      const panels = [...track.querySelectorAll("[data-panel]")];
      return {
        deviceW: dr.width,
        inputBottom: ir.bottom,
        trackTop: tr.top,
        trackW: track.clientWidth,
        panelCount: panels.length,
        panelWs: panels.map((p) => +p.getBoundingClientRect().width.toFixed(1)),
      };
    });

    check(
      61,
      "desktop: phone device width >= 340",
      layout != null && layout.deviceW >= 340,
      layout == null ? "device/input/track not found" : `device width ${layout.deviceW.toFixed(1)}px (need >= 340)`,
    );

    /* Amended (change 12): the pills are retired — the section-3 track is the
       switcher. The desktop composition claim becomes: the name input sits
       ABOVE the track, and the track holds one full-width panel per preset
       (the row-of-cards collapse the spec forbids would fail the width
       equality). */
    check(
      62,
      "desktop section 3: name input above the preset track; one full-track-width panel per preset",
      layout != null &&
        layout.inputBottom <= layout.trackTop + 1 &&
        layout.panelCount === presets.length &&
        layout.panelWs.every((w) => Math.abs(w - layout.trackW) <= 2),
      layout == null
        ? "device/input/track not found"
        : `input bottom ${layout.inputBottom.toFixed(1)} vs track top ${layout.trackTop.toFixed(1)} (input must be above); ` +
          `${layout.panelCount} panel(s) (need ${presets.length}), widths [${layout.panelWs.join(", ")}] vs track ${layout.trackW}`,
    );

    await waitT(page, 11.0);
    const devtools = await page.evaluate(() => {
      const hits = [
        "nextjs-portal",
        "[data-next-badge-root]",
        "[data-nextjs-toast]",
        "[data-nextjs-dev-tools-button]",
        "#__next-build-watcher",
      ].filter((sel) => document.querySelector(sel) != null);
      return { hits };
    });

    /* The assertion targets the PRODUCTION DOM: `next dev` always mounts the
       nextjs-portal overlay host (even with devIndicators:false, which only
       hides the badge), and it is compiled out of production builds. On a
       localhost run the production precondition doesn't hold, so a
       portal-only match is reported, not failed. */
    const isDevServer = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(base);
    const devOnlyPortal = isDevServer && devtools.hits.length === 1 && devtools.hits[0] === "nextjs-portal";
    check(
      63,
      "settled DOM at 1440x900: no element matching the Next devtools indicator (asserted on production hosts)",
      devtools.hits.length === 0 || devOnlyPortal,
      devtools.hits.length === 0
        ? "no devtools indicator selectors matched"
        : devOnlyPortal
          ? "dev server: nextjs-portal is the dev-only overlay host, compiled out of production builds"
          : `matched: ${devtools.hits.join(", ")}`,
    );

    await ctx.close();
  });

  /* --- 64 + 71: pager anatomy + progress dots. --- */
  await block("pager-anatomy", async () => {
    const rows = [];
    for (const vp of [
      { w: 390, h: 844 },
      { w: 1440, h: 900 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      const g = await page.evaluate(() => {
        const pager = document.querySelector("[data-pager]");
        const sections = [...document.querySelectorAll("[data-section]")];
        return {
          snapType: pager ? getComputedStyle(pager).scrollSnapType : null,
          sectionCount: sections.length,
          heights: sections.map((el) => el.clientHeight),
          innerHeight: window.innerHeight,
        };
      });
      rows.push({ vp: `${vp.w}x${vp.h}`, ...g });
      await ctx.close();
    }

    check(
      64,
      'pager computed scroll-snap-type is "y mandatory"; exactly four [data-section], each clientHeight === innerHeight within 2px, at 390x844 and 1440x900',
      rows.length === 2 &&
        rows.every(
          (r) =>
            r.snapType === "y mandatory" &&
            r.sectionCount === 4 &&
            r.heights.every((h) => Math.abs(h - r.innerHeight) <= 2),
        ),
      rows
        .map(
          (r) =>
            `${r.vp} -> snap ${JSON.stringify(r.snapType)} (need "y mandatory"), ${r.sectionCount} section(s) (need 4), ` +
            `heights [${r.heights.join(", ")}] vs viewport ${r.innerHeight} (need within 2px)`,
        )
        .join(" | "),
    );

    /* 71 needs hydration: the dots' active state is client wiring. */
    const ctx71 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page71 = await ctx71.newPage();
    await page71.goto(base, { waitUntil: "domcontentloaded" });
    await waitHydrated(page71);
    await page71.waitForTimeout(300);
    const dots = await page71.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const toRgb = (name) => {
        const h = root.getPropertyValue(name).trim().replace("#", "");
        if (h.length < 6) return null;
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      const all = [...document.querySelectorAll("[data-pager-dot]")];
      const active = all.filter((d) => d.getAttribute("data-active") === "true");
      return {
        teal: toRgb("--color-teal"),
        count: all.length,
        activeCount: active.length,
        activeBg: active[0] ? getComputedStyle(active[0]).backgroundColor : null,
        inactiveBgs: all
          .filter((d) => d.getAttribute("data-active") !== "true")
          .map((d) => getComputedStyle(d).backgroundColor),
      };
    });

    check(
      71,
      "exactly four progress dots; the active dot's computed background is teal; only one active at a time",
      dots.count === 4 &&
        dots.activeCount === 1 &&
        dots.activeBg === dots.teal &&
        dots.inactiveBgs.every((c) => c !== dots.teal),
      `${dots.count} dot(s) (need 4), ${dots.activeCount} active (need 1); active bg ${dots.activeBg} ` +
        `(need teal ${dots.teal}); inactive bgs ${JSON.stringify(dots.inactiveBgs)} (must not be teal)`,
    );
    await ctx71.close();
  });

  /* --- 65: no hijack-capable wheel/touch listeners. addEventListener is
   * wrapped BEFORE any page script runs; every wheel/mousewheel/touchmove
   * registration on window/document/html/body/pager is recorded with its
   * passive flag. React's own delegated listeners are passive by design —
   * a passive listener physically cannot preventDefault, so the assertion
   * targets non-passive (hijack-capable) registrations. --- */
  await block("no-hijack-listeners", async () => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const rec = [];
      window.__wheelTouchListeners = rec;
      const orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, fn, opts) {
        if (type === "wheel" || type === "mousewheel" || type === "touchmove") {
          let target = "element";
          try {
            if (this === window) target = "window";
            else if (this === document) target = "document";
            else if (this === document.documentElement) target = "html";
            else if (this === document.body) target = "body";
            else if (this instanceof Element && this.hasAttribute("data-pager")) target = "pager";
          } catch {}
          const passive = typeof opts === "object" && opts !== null ? opts.passive === true : false;
          rec.push({ type, target, passive });
        }
        return orig.call(this, type, fn, opts);
      };
    });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await waitHydrated(page);
    await page.waitForTimeout(400);
    const log = await page.evaluate(() => window.__wheelTouchListeners);
    const offenders = log.filter(
      (l) => ["window", "document", "html", "body", "pager"].includes(l.target) && !l.passive,
    );

    check(
      65,
      "no non-passive (hijack-capable) wheel/mousewheel/touchmove listener on window, document, or the pager",
      offenders.length === 0,
      `${log.length} wheel/touch registration(s) recorded: ${JSON.stringify(log)}; ` +
        `non-passive on window/document/pager: ${offenders.length} (need 0)`,
    );
    await ctx.close();
  });

  /* --- 66 + 67: gesture axes never fight — iOS emulation, real touch
   * sequences via CDP. --- */
  await block("gesture-axes", async () => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitHydrated(page);
    const cdp = await ctx.newCDPSession(page);
    /* The gesture is sampled at its END (last touchMove still down): synthetic
       CDP touches carry no fling velocity, so Chromium's post-release snap
       settle is nondeterministic in emulation — a sub-half drag may snap back
       exactly as it would for a slow-fingered user. WHICH AXIS OWNED THE
       GESTURE is what this gate asserts; landing on snap points is gate
       64's (declarative) and 70's (keyboard) job. */
    const drag = async (x, y, dx, dy, endState) => {
      const steps = 8;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let i = 1; i <= steps; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }],
        });
        await page.waitForTimeout(12);
      }
      const atEnd = await endState();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      return atEnd;
    };
    const state = () =>
      page.evaluate(() => ({
        pagerTop: document.querySelector("[data-pager]").scrollTop,
        trackLeft: document.querySelector('[data-section="yours"] [data-track]').scrollLeft,
      }));

    /* Change 15 (A1) removed section 2's track — the preset track in
       section 3 is the page's one horizontal scroller now, so the axis
       assertions run there. Assertions unchanged. A prior drag's snap
       animation can fight a bare scrollTop assignment, so the position is
       re-asserted until it sticks. */
    const settleAt = async (top) => {
      for (let i = 0; i < 10; i++) {
        await page.evaluate((n) => {
          document.querySelector("[data-pager]").scrollTop = n;
        }, top);
        await page.waitForTimeout(250);
        const now = await page.evaluate(() => document.querySelector("[data-pager]").scrollTop);
        if (Math.abs(now - top) <= 2) return;
      }
    };
    await settleAt(844 * 2);
    const before66 = await state();
    const end66 = await drag(195, 380, 0, -300, state);

    check(
      66,
      "vertical 300px touch drag over a section-3 track panel moves the pager scrollTop >= 200px and the track scrollLeft by 0 (sampled at gesture end)",
      end66.pagerTop - before66.pagerTop >= 200 && end66.trackLeft === before66.trackLeft,
      `pager scrollTop ${before66.pagerTop} -> ${end66.pagerTop} (delta ${(end66.pagerTop - before66.pagerTop).toFixed(1)}, need >= 200); ` +
        `track scrollLeft ${before66.trackLeft} -> ${end66.trackLeft} (need unchanged)`,
    );

    await settleAt(844 * 2);
    await page.evaluate(() => {
      document.querySelector('[data-section="yours"] [data-track]').scrollLeft = 0;
    });
    await page.waitForTimeout(300);
    const before67 = await state();
    const end67 = await drag(330, 300, -200, 0, state);

    check(
      67,
      "horizontal 200px touch drag over the same panel moves the track scrollLeft >= 150px and the pager scrollTop by 0 (sampled at gesture end)",
      end67.trackLeft - before67.trackLeft >= 150 && end67.pagerTop === before67.pagerTop,
      `track scrollLeft ${before67.trackLeft} -> ${end67.trackLeft} (delta ${(end67.trackLeft - before67.trackLeft).toFixed(1)}, need >= 150); ` +
        `pager scrollTop ${before67.pagerTop} -> ${end67.pagerTop} (need unchanged)`,
    );
    await ctx.close();
  });

  /* --- 68: playback is intersection-gated, not load-gated. The page is
   * scrolled to section 3 BEFORE hydration (waitUntil: commit + an instant
   * scroll as soon as the pager exists), so the call section is never 60%
   * visible when the engine mounts. --- */
  await block("deep-arrival", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    /* The scroll must land BEFORE the app boots — that is the scenario under
       test. On a fast host hydration can win the race against the gate's own
       round-trips (the change-13 live run proved it), so the framework
       bundles are held back until the scroll is in place. Test plumbing
       only: the app under test is unchanged. */
    let holdScripts = true;
    await page.route("**/*.js*", async (route) => {
      while (holdScripts) await new Promise((r) => setTimeout(r, 50));
      await route.continue();
    });
    await page.goto(base, { waitUntil: "commit" });
    /* All four sections must have STREAMED before the scroll, or scrollTop
       clamps against a half-delivered document (the live host streams; the
       dev server delivers in one chunk). */
    await page.waitForFunction(() => {
      const p = document.querySelector("[data-pager]");
      return p != null && p.scrollHeight >= p.clientHeight * 3.5;
    });
    const tAtScroll = await page.evaluate(() => {
      history.scrollRestoration = "manual";
      const pager = document.querySelector("[data-pager]");
      pager.scrollTop = pager.clientHeight * 2;
      return {
        t: document.querySelector("[data-demo]")?.getAttribute("data-t") ?? null,
        scrollTop: pager.scrollTop,
      };
    });
    holdScripts = false;
    await waitHydrated(page);
    await page.waitForTimeout(2000);
    const parked = await page.evaluate(() => ({
      t: document.querySelector("[data-demo]").getAttribute("data-t"),
      scrollTop: document.querySelector("[data-pager]").scrollTop,
    }));
    await page.evaluate(() => {
      document.querySelector("[data-pager]").scrollTop = 0;
    });
    await page.waitForTimeout(500);
    const started = await page.evaluate(
      () => document.querySelector("[data-demo]").getAttribute("data-t"),
    );

    check(
      68,
      'loaded scrolled to section 3: playback NOT started 2s after hydration (data-t parked at "0.000"); starts within 500ms of section 1 reaching 60% visibility',
      parked.t === "0.000" && Number.isFinite(parseFloat(started)) && parseFloat(started) > 0,
      `at scroll: data-t ${JSON.stringify(tAtScroll.t)}, scrollTop ${tAtScroll.scrollTop}; 2s after hydration ` +
        `${JSON.stringify(parked.t)} (need "0.000") at pager scrollTop ${parked.scrollTop}; ` +
        `500ms after returning to section 1: ${JSON.stringify(started)} (need > 0)`,
    );
    await ctx.close();
  });

  /* --- 69: the track IS the switcher. --- */
  await block("track-preset-link", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitHydrated(page);
    await goSection(page, 2);
    await snapTrack(page, 1);
    await page.waitForTimeout(400);
    const g = await page.evaluate(() => ({
      phoneHeader: document.querySelector("[data-biz-name]")?.textContent?.trim() ?? null,
      callScreen: document.querySelector("[data-call-biz]")?.textContent?.trim() ?? null,
      ledgerHeader: document.querySelector("[data-ledger-biz]")?.textContent?.trim() ?? null,
      url: location.href,
    }));

    check(
      69,
      "snapping section 3's track to panel index 1 re-skins bizName everywhere within 400ms; URL gains ?biz=home",
      g.phoneHeader === homePreset.bizName &&
        g.callScreen === homePreset.bizName &&
        g.ledgerHeader === homePreset.bizName &&
        g.url.includes("biz=home"),
      `phone header ${JSON.stringify(g.phoneHeader)}, call screen ${JSON.stringify(g.callScreen)}, ` +
        `ledger header ${JSON.stringify(g.ledgerHeader)} (all must be ${JSON.stringify(homePreset.bizName)}); url ${g.url}`,
    );
    await ctx.close();
  });

  /* --- 70: keyboard drives the pager and the active track. --- */
  await block("keyboard-nav", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitHydrated(page);
    await page.waitForTimeout(300);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(900);
    const afterDown = await page.evaluate(() => {
      const dots = [...document.querySelectorAll("[data-pager-dot]")];
      return {
        activeIdx: dots.findIndex((d) => d.getAttribute("data-active") === "true"),
        scrollTop: document.querySelector("[data-pager]").scrollTop,
        vh: window.innerHeight,
      };
    });

    await goSection(page, 2);
    await page.waitForTimeout(400);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    const afterRight = await page.evaluate(() => {
      const track = document.querySelector('[data-section="yours"] [data-track]');
      return { left: track.scrollLeft, w: track.clientWidth };
    });

    check(
      70,
      "ArrowDown from section 1 lands on section 2 (active dot index 1); ArrowRight in section 3 advances the track one panel",
      afterDown.activeIdx === 1 &&
        Math.abs(afterDown.scrollTop - afterDown.vh) <= 2 &&
        Math.abs(afterRight.left - afterRight.w) <= 2,
      `after ArrowDown: active dot ${afterDown.activeIdx} (need 1), pager scrollTop ${afterDown.scrollTop} ` +
        `(need ~${afterDown.vh}); after ArrowRight in section 3: track scrollLeft ${afterRight.left} (need ~${afterRight.w})`,
    );
    await ctx.close();
  });

  /* --- 72: reduced motion — snap stays, programmatic scrolls go "auto". --- */
  await block("reduced-pager", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("[data-demo]")?.getAttribute("data-t") != null,
    );
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const calls = [];
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (opts) {
        calls.push(opts && typeof opts === "object" ? (opts.behavior ?? null) : null);
        return orig.call(this, opts);
      };
      document.querySelectorAll("[data-pager-dot]")[2].click();
      Element.prototype.scrollIntoView = orig;
      return {
        snapType: getComputedStyle(document.querySelector("[data-pager]")).scrollSnapType,
        calls,
      };
    });

    check(
      72,
      'reduced motion: pager snap-type still "y mandatory"; a dot click calls scrollIntoView with behavior "auto" (spy)',
      g.snapType === "y mandatory" && g.calls.length === 1 && g.calls[0] === "auto",
      `snap ${JSON.stringify(g.snapType)} (need "y mandatory"); scrollIntoView calls ${JSON.stringify(g.calls)} ` +
        `(need exactly ["auto"])`,
    );
    await ctx.close();
  });

  /* --- 74 + 76 + 77 + 79 + 80 + 81: frame scale, desktop pass. --- */
  await block("frame-scale-desktop", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    const g = await page.evaluate(() => {
      const device = document.querySelector('[data-section="save"] [data-phone-device]');
      const bubble = document.querySelector('[data-section="save"] [data-s-bubble]');
      const vp = document.querySelector('[data-section="save"] [data-s-viewport]');
      if (!device || !bubble || !vp) return null;
      return {
        w: device.getBoundingClientRect().width,
        bubbleTop: bubble.getBoundingClientRect().top,
        vpTop: vp.getBoundingClientRect().top,
      };
    });

    check(
      74,
      "section 2 desktop static phone width >= 340 at 1440x900; the thread's first bubble is not clipped (top >= thread viewport top)",
      g != null && g.w >= 340 && g.bubbleTop >= g.vpTop - 1,
      g == null
        ? "save device, first static bubble, or thread viewport not found"
        : `device width ${g.w.toFixed(1)}px (need >= 340); first bubble top ${g.bubbleTop.toFixed(1)} vs ` +
          `thread viewport top ${g.vpTop.toFixed(1)} (bubble must not start above it)`,
    );

    /* 83 (change 14): full containment — the device ends >= 24px above the
       section's bottom edge, and the thread's END (last bubble + Delivered)
       sits fully inside the screen. */
    const contain = await page.evaluate(() => {
      const section = document.querySelector('[data-section="save"]');
      const device = section?.querySelector("[data-phone-device]");
      const screen = section?.querySelector("[data-phone-screen]");
      const bubbles = section ? [...section.querySelectorAll("[data-s-bubble]")] : [];
      const delivered = section?.querySelector("[data-s-delivered]");
      if (!section || !device || !screen || bubbles.length === 0 || !delivered) return null;
      const secR = section.getBoundingClientRect();
      const dr = device.getBoundingClientRect();
      const scr = screen.getBoundingClientRect();
      const lastR = bubbles[bubbles.length - 1].getBoundingClientRect();
      const delR = delivered.getBoundingClientRect();
      const inside = (a, b) =>
        a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      return {
        deviceW: dr.width,
        clearance: secR.bottom - dr.bottom,
        lastBubbleInside: inside(lastR, scr),
        deliveredInside: inside(delR, scr),
        lastBubbleBottom: lastR.bottom,
        deliveredBottom: delR.bottom,
        screenBottom: scr.bottom,
      };
    });

    check(
      83,
      "section 2 desktop: device bottom >= 24px above the section bottom; last bubble + Delivered fully inside the screen; width >= 340",
      contain != null &&
        contain.deviceW >= 340 &&
        contain.clearance >= 24 &&
        contain.lastBubbleInside === true &&
        contain.deliveredInside === true,
      contain == null
        ? "section, device, screen, static bubbles, or Delivered not found"
        : `device width ${contain.deviceW.toFixed(1)}px (need >= 340); bottom clearance ${contain.clearance.toFixed(1)}px ` +
          `(need >= 24); last bubble inside screen ${contain.lastBubbleInside} (bottom ${contain.lastBubbleBottom.toFixed(1)}), ` +
          `Delivered inside ${contain.deliveredInside} (bottom ${contain.deliveredBottom.toFixed(1)}) vs screen bottom ${contain.screenBottom.toFixed(1)}`,
    );

    const tiles = await page.evaluate(() => {
      const money = document.querySelector("[data-money]");
      const visibleTiles = money
        ? [...money.children].filter((el) => getComputedStyle(el).display !== "none").length
        : -1;
      const share = document.querySelector("[data-share]");
      const scs = share ? getComputedStyle(share) : null;
      const sr = share ? share.getBoundingClientRect() : null;
      const root = getComputedStyle(document.documentElement);
      const toRgb = (name) => {
        const h = root.getPropertyValue(name).trim().replace("#", "");
        if (h.length < 6) return null;
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      return {
        visibleTiles,
        teal: toRgb("--color-teal"),
        shareBorder: scs ? scs.borderTopColor : null,
        shareW: sr ? sr.width : 0,
        shareH: sr ? sr.height : 0,
      };
    });

    const yours = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const toRgb = (name) => {
        const h = root.getPropertyValue(name).trim().replace("#", "");
        if (h.length < 6) return null;
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      const gold = toRgb("--color-gold");
      const panels = [...document.querySelectorAll('[data-section="yours"] [data-panel]')];
      return {
        gold,
        panelCount: panels.length,
        tileCounts: panels.map((p) => p.querySelectorAll("[data-tile]").length),
        ticketColors: panels.map((p) => {
          const t = p.querySelector("[data-ticket]");
          return t ? getComputedStyle(t).color : null;
        }),
        valueSizes: [...document.querySelectorAll('[data-section="yours"] [data-tile-value]')].map((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        ),
      };
    });

    check(
      79,
      "section 3: three tiles per panel; ticket value computed color === gold; tile values >= 40px at 1440",
      yours.panelCount === presets.length &&
        yours.tileCounts.every((n) => n === 3) &&
        yours.ticketColors.every((c) => c === yours.gold) &&
        yours.valueSizes.length === presets.length * 3 &&
        yours.valueSizes.every((n) => n >= 40),
      `${yours.panelCount} panel(s), tiles per panel [${yours.tileCounts.join(", ")}] (need 3 each); ` +
        `ticket colors ${JSON.stringify(yours.ticketColors)} (need gold ${yours.gold}); ` +
        `value sizes [${yours.valueSizes.join(", ")}] (need all >= 40)`,
    );

    const typeScan = await page.evaluate(() => {
      const math = document.querySelector("[data-math]");
      if (!math) return null;
      let max = 0;
      let maxTag = null;
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.closest("[data-scene]")) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const fs = parseFloat(cs.fontSize);
        if (fs > max) {
          max = fs;
          maxTag = math.contains(el) || el === math ? "in-math" : el.tagName + (el.dataset ? JSON.stringify({ ...el.dataset }) : "");
        }
      }
      return { mathFS: parseFloat(getComputedStyle(math).fontSize), max, maxTag };
    });

    const glows = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("[data-section]")];
      return sections.map((sec) => {
        const g = sec.querySelectorAll("[data-glow]");
        return {
          id: sec.dataset.section,
          count: g.length,
          animation: g[0] ? getComputedStyle(g[0]).animationName : null,
        };
      });
    });

    check(
      81,
      'each section has exactly one [data-glow], and its computed animation-name is "none"',
      glows.length === 4 && glows.every((g) => g.count === 1 && g.animation === "none"),
      glows.map((g) => `${g.id}: ${g.count} glow(s), animation ${JSON.stringify(g.animation)}`).join(" | "),
    );

    /* --- 75-77, 80: mobile pass. --- */
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageM = await ctxM.newPage();
    await pageM.goto(base, { waitUntil: "domcontentloaded" });
    await pageM.evaluate(() => document.fonts.ready);

    const m = await pageM.evaluate(() => {
      const money = document.querySelector("[data-money]");
      const share = document.querySelector("[data-share]");
      const scs = share ? getComputedStyle(share) : null;
      const sr = share ? share.getBoundingClientRect() : null;
      const math = document.querySelector("[data-math]");
      const root = getComputedStyle(document.documentElement);
      const toRgb = (name) => {
        const h = root.getPropertyValue(name).trim().replace("#", "");
        if (h.length < 6) return null;
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      let max = 0;
      let maxTag = null;
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.closest("[data-scene]")) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const fs = parseFloat(cs.fontSize);
        if (fs > max) {
          max = fs;
          maxTag = math && (math.contains(el) || el === math) ? "in-math" : el.tagName;
        }
      }
      return {
        visibleTiles: money
          ? [...money.children].filter((el) => getComputedStyle(el).display !== "none").length
          : -1,
        teal: toRgb("--color-teal"),
        shareBorder: scs ? scs.borderTopColor : null,
        shareW: sr ? sr.width : 0,
        shareH: sr ? sr.height : 0,
        mathFS: math ? parseFloat(getComputedStyle(math).fontSize) : 0,
        max,
        maxTag,
      };
    });

    check(
      76,
      "metric tiles: exactly 2 rendered below 600px, 3 at desktop",
      m.visibleTiles === 2 && tiles.visibleTiles === 3,
      `390x844 visible tiles ${m.visibleTiles} (need 2); 1440x900 visible tiles ${tiles.visibleTiles} (need 3)`,
    );

    /* Amended (change 15, A3): the Share control is the rail's teal-outline
       circle now — the section-2 fill button it replaced is gone. */
    check(
      77,
      "rail share control: teal outline circle >= 36px, present at 390x844 and 1440x900",
      m.shareBorder === m.teal &&
        m.shareW >= 36 &&
        Math.abs(m.shareW - m.shareH) <= 1 &&
        tiles.shareBorder === tiles.teal &&
        tiles.shareW >= 36 &&
        Math.abs(tiles.shareW - tiles.shareH) <= 1,
      `390: border ${m.shareBorder}, ${m.shareW.toFixed(1)}x${m.shareH.toFixed(1)}px; ` +
        `1440: border ${tiles.shareBorder}, ${tiles.shareW.toFixed(1)}x${tiles.shareH.toFixed(1)}px ` +
        `(need teal ${m.teal} border, circular, >= 36px)`,
    );

    /* 80 (amended, change 15): the desktop scene type's 96px clock line is
       excluded from the scan — A2 sets it larger by spec; the math line
       remains the largest text everywhere else. */
    check(
      80,
      "math line font-size >= 40px at 390 and >= 64px at 1440, and the largest text outside the scene type at both",
      m.mathFS >= 40 &&
        m.max <= m.mathFS + 0.5 &&
        m.maxTag === "in-math" &&
        typeScan != null &&
        typeScan.mathFS >= 64 &&
        typeScan.max <= typeScan.mathFS + 0.5 &&
        typeScan.maxTag === "in-math",
      `390: math ${m.mathFS}px (need >= 40), page max ${m.max}px on ${JSON.stringify(m.maxTag)}; ` +
        `1440: math ${typeScan?.mathFS}px (need >= 64), page max ${typeScan?.max}px on ${JSON.stringify(typeScan?.maxTag)} ` +
        `(the max must live inside [data-math])`,
    );

    await ctxM.close();
    await ctx.close();
  });

  /* --- 84 + 87: change-15 structure — owner-first mobile, section-3 device. --- */
  await block("structure-15", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitHydrated(page);

    const g84 = await page.evaluate(() => {
      const save = document.querySelector('[data-section="save"]');
      if (!save) return null;
      const sr = save.getBoundingClientRect();
      const dev = save.querySelector("[data-phone-device]");
      const card = save.querySelector("[data-notify-ledger]");
      const panel = save.querySelector("[data-panel-content]");
      const inside = (r) => r.left >= sr.left - 1 && r.right <= sr.right + 1 && r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1;
      return {
        phoneRendered: dev ? dev.offsetParent != null : false,
        trackPresent: save.querySelector("[data-track]") != null,
        cardInside: card ? inside(card.getBoundingClientRect()) : false,
        ledgerInside: panel ? inside(panel.getBoundingClientRect()) : false,
      };
    });

    check(
      84,
      "mobile section 2: no rendered phone, no [data-track]; docked card and ledger fully inside the section",
      g84 != null &&
        g84.phoneRendered === false &&
        g84.trackPresent === false &&
        g84.cardInside === true &&
        g84.ledgerInside === true,
      g84 == null
        ? "save section not found"
        : `phone rendered ${g84.phoneRendered} (need false), track present ${g84.trackPresent} (need false), ` +
          `card inside ${g84.cardInside}, ledger inside ${g84.ledgerInside} (both need true)`,
    );

    const g87m = await page.evaluate(() => {
      const yours = document.querySelector('[data-section="yours"]');
      if (!yours) return null;
      const yr = yours.getBoundingClientRect();
      const dev = yours.querySelector("[data-phone-device]");
      const track = yours.querySelector("[data-track]");
      const tiles = [...yours.querySelectorAll("[data-panel] [data-tile]")];
      const header = yours.querySelector("[data-crop-biz]");
      const bubble = yours.querySelector("[data-s-bubble]");
      if (!dev || !track || tiles.length < 3 || !header || !bubble) return null;
      const dr = dev.getBoundingClientRect();
      const tr = track.getBoundingClientRect();
      const third = tiles[2].getBoundingClientRect();
      const hr = header.getBoundingClientRect();
      const br = bubble.getBoundingClientRect();
      return {
        devTopVsThirdTile: dr.top - third.bottom,
        devBottomVsPanel: dr.bottom - tr.bottom,
        headerInside: hr.top >= yr.top - 1 && hr.bottom <= yr.bottom + 1,
        bubbleInside: br.top >= yr.top - 1 && br.bottom <= yr.bottom + 1,
        visiblePct: ((yr.bottom - dr.top) / dr.height) * 100,
      };
    });

    /* Desktop half of 87. */
    const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageD = await ctxD.newPage();
    await pageD.goto(base, { waitUntil: "domcontentloaded" });
    await pageD.evaluate(() => document.fonts.ready);
    const g87d = await pageD.evaluate(() => {
      const yours = document.querySelector('[data-section="yours"]');
      const dev = yours?.querySelector("[data-phone-device]");
      const input = document.querySelector("[data-name-input]");
      if (!yours || !dev || !input) return null;
      const yr = yours.getBoundingClientRect();
      const dr = dev.getBoundingClientRect();
      const ir = input.getBoundingClientRect();
      return {
        clearance: yr.bottom - dr.bottom,
        inputGap: dr.top - ir.bottom,
        devW: dr.width,
      };
    });

    check(
      87,
      "section 3 — desktop: phone contained (clearance >= 24) with the name input within 40px above it; mobile: phone below the third tile, bleeding past the panel bottom, header + thread[0] visible",
      g87d != null &&
        g87d.clearance >= 24 &&
        g87d.inputGap >= 0 &&
        g87d.inputGap <= 40 &&
        g87m != null &&
        g87m.devTopVsThirdTile > 0 &&
        g87m.devBottomVsPanel > 0 &&
        g87m.headerInside === true &&
        g87m.bubbleInside === true,
      `desktop: ${g87d == null ? "nodes missing" : `clearance ${g87d.clearance.toFixed(1)}px (need >= 24), input->phone gap ${g87d.inputGap.toFixed(1)}px (need 0..40), width ${g87d.devW.toFixed(1)}px`}; ` +
        `mobile: ${g87m == null ? "nodes missing" : `top ${g87m.devTopVsThirdTile.toFixed(1)}px below third tile (need > 0), bottom ${g87m.devBottomVsPanel.toFixed(1)}px past panel (need > 0), header inside ${g87m.headerInside}, thread[0] inside ${g87m.bubbleInside}, ~${g87m.visiblePct.toFixed(0)}% visible`}`,
    );

    await ctxD.close();
    await ctx.close();
  });

  /* --- 85: the desktop scene type rides the one clock. --- */
  await block("scene-type", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    const readScene = () =>
      page.evaluate((EFF) => {
        const vis = eval(EFF);
        const lines = [...document.querySelectorAll("[data-scene-line]")];
        const visible = lines.filter((l) => vis(l) > 0.5);
        return {
          t: document.querySelector("[data-demo]")?.getAttribute("data-t"),
          visibleTexts: visible.map((l) => l.textContent.trim()),
        };
      }, EFF);

    await waitT(page, 0.5);
    const early = await readScene();
    await waitT(page, 4.0);
    const mid = await readScene();
    await waitT(page, 6.5);
    const late = await readScene();

    /* Absent below 1100px. */
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageM = await ctxM.newPage();
    await pageM.goto(base, { waitUntil: "domcontentloaded" });
    const mobileScene = await pageM.evaluate((EFF) => {
      const vis = eval(EFF);
      const scene = document.querySelector("[data-scene]");
      return scene ? vis(scene) : null;
    }, EFF);
    await ctxM.close();

    check(
      85,
      `desktop scene type: "${sceneClosed}" at t=0.5, "${sceneDialing}" at t=4.0, "${sceneCaught}" at t=6.5; absent at 390x844`,
      early.visibleTexts.length === 1 &&
        early.visibleTexts[0] === sceneClosed &&
        mid.visibleTexts.length === 1 &&
        mid.visibleTexts[0] === sceneDialing &&
        late.visibleTexts.length === 1 &&
        late.visibleTexts[0] === sceneCaught &&
        mobileScene === 0,
      `t=${early.t}: ${JSON.stringify(early.visibleTexts)} (want ${JSON.stringify([sceneClosed])}); ` +
        `t=${mid.t}: ${JSON.stringify(mid.visibleTexts)} (want ${JSON.stringify([sceneDialing])}); ` +
        `t=${late.t}: ${JSON.stringify(late.visibleTexts)} (want ${JSON.stringify([sceneCaught])}); ` +
        `390x844 scene effective opacity ${mobileScene} (need 0)`,
    );
    await ctx.close();
  });

  /* --- 86: the rail carries share, sound, and next everywhere. --- */
  await block("rail", async () => {
    const origin = new URL(base).origin;
    for (const vp of [
      { w: 390, h: 844 },
      { w: 1440, h: 900 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      if (vp.w === 1440) await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await waitHydrated(page);

      const present = await page.evaluate((EFF) => {
        const vis = eval(EFF);
        const q = (sel, min = 0.5) => {
          const el = document.querySelector(sel);
          return el ? vis(el) > min : false;
        };
        return {
          share: q("[data-rail-share]"),
          sound: q("[data-sound-toggle]"),
          /* The chevron runs 40% opacity by spec (A3) — presence, not
             prominence, is the claim. */
          next: q("[data-rail-next]", 0.2),
          dots: document.querySelectorAll("[data-pager-dot]").length,
        };
      }, EFF);

      await goSection(page, 3);
      await page.waitForTimeout(500);
      const onLast = await page.evaluate((EFF) => {
        const vis = eval(EFF);
        const next = document.querySelector("[data-rail-next]");
        return { nextVisible: next ? vis(next) > 0.5 : false };
      }, EFF);

      let clip = "(not tested at this width)";
      let clipOk = true;
      if (vp.w === 1440) {
        await goSection(page, 2);
        await page.fill("[data-name-input]", "Test Salon");
        await page.waitForTimeout(300);
        await page.click("[data-rail-share]");
        await page.waitForTimeout(250);
        try {
          clip = await page.evaluate(() => navigator.clipboard.readText());
        } catch (err) {
          clip = `clipboard error: ${err.message}`;
        }
        clipOk = clip === `${shareOrigin}/?biz=${expected.id}&name=Test%20Salon`;
      }

      check(
        86,
        `rail at ${vp.w}x${vp.h}: share + sound + chevron present with 4 dots; chevron hidden on section 4; rail share copies the ?biz&name deep link`,
        present.share && present.sound && present.next && present.dots === 4 && onLast.nextVisible === false && clipOk,
        `share ${present.share}, sound ${present.sound}, next ${present.next}, dots ${present.dots} (need 4); ` +
          `next visible on section 4: ${onLast.nextVisible} (need false); clipboard ${JSON.stringify(clip)}`,
      );
      await ctx.close();
    }
  });

  /* --- 88 + 89: synthesized sound — counts and clock fidelity. --- */
  await block("sound-schedule", async () => {
    const SPY = () => {
      window.__acCount = 0;
      window.__oscStarts = [];
      const Orig = window.AudioContext;
      const Wrapped = function (...args) {
        const inst = new Orig(...args);
        window.__acCount++;
        window.__acLast = inst;
        return inst;
      };
      Wrapped.prototype = Orig.prototype;
      window.AudioContext = Wrapped;
      const origStart = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (when) {
        window.__oscStarts.push({
          when: when ?? this.context.currentTime,
          ctxTime: this.context.currentTime,
          phase: parseFloat(document.querySelector("[data-demo]")?.getAttribute("data-t") ?? "NaN"),
          freq: this.frequency.value,
          type: this.type,
        });
        return origStart.call(this, when);
      };
    };

    /* Sound OFF: a full playback must create NOTHING. */
    const ctxOff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageOff = await ctxOff.newPage();
    await pageOff.addInitScript(SPY);
    await pageOff.goto(base, { waitUntil: "domcontentloaded" });
    await waitT(pageOff, 13.5);
    const off = await pageOff.evaluate(() => ({
      acCount: window.__acCount,
      oscStarts: window.__oscStarts.length,
    }));
    await ctxOff.close();

    /* Sound ON: toggle (the gesture), then replay — exactly 5 oscillator
       starts: 3 ring (40Hz custom PeriodicWave carrying 440+480), 1 chime
       (triangle), 1 land (220 sine). */
    const ctxOn = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageOn = await ctxOn.newPage();
    await pageOn.addInitScript(SPY);
    await pageOn.goto(base, { waitUntil: "domcontentloaded" });
    await waitT(pageOn, 13.5);
    await pageOn.click("[data-sound-toggle]");
    await pageOn.waitForTimeout(200);
    await pageOn.evaluate(() => {
      window.__oscStarts.length = 0;
    });
    await pageOn.click("[data-replay]");
    /* data-t was already ~13.8 — wait for the reset to a small value first,
       or waitT(11) returns before the replay even begins. */
    await pageOn.waitForFunction(() => {
      const v = parseFloat(document.querySelector("[data-demo]")?.getAttribute("data-t") ?? "");
      return Number.isFinite(v) && v < 2;
    });
    await waitT(pageOn, 11.0);
    const starts = await pageOn.evaluate(() => window.__oscStarts);
    await ctxOn.close();

    const rings = starts.filter((r) => r.type === "custom");
    const chimes = starts.filter((r) => r.type === "triangle");
    const lands = starts.filter((r) => r.type === "sine");

    check(
      88,
      "sound OFF: zero AudioContexts and zero oscillator starts after full playback; sound ON (toggle then replay): exactly 5 oscillator starts — 3 ring, 1 chime, 1 land",
      off.acCount === 0 &&
        off.oscStarts === 0 &&
        starts.length === 5 &&
        rings.length === 3 &&
        chimes.length === 1 &&
        lands.length === 1,
      `OFF: ${off.acCount} AudioContext(s), ${off.oscStarts} start(s) (need 0/0); ` +
        `ON: ${starts.length} start(s) — ${rings.length} ring, ${chimes.length} chime, ${lands.length} land (need 3/1/1); ` +
        `schedule: ${starts.map((r) => `${r.type}@phase ${Number.isFinite(r.phase) ? r.phase.toFixed(3) : "?"}`).join(", ")}`,
    );

    const BEATS_15 = [0.2, 1.4, 2.6, 4.4, 10.0];
    const byPhase = [...starts].sort((a, b) => a.phase - b.phase);
    const rows = byPhase.map((r, i) => {
      const beat = BEATS_15[i];
      const phaseAtStart = r.phase + (r.when - r.ctxTime);
      return { beat, phaseAtStart, delta: Math.abs(phaseAtStart - beat), type: r.type };
    });

    check(
      89,
      "each oscillator's scheduled start, converted to phase seconds, is within 50ms of its beat (0.2, 1.4, 2.6, 4.4, 10.0)",
      rows.length === 5 && rows.every((r) => Number.isFinite(r.phaseAtStart) && r.delta <= 0.05),
      rows.length === 0
        ? "no oscillator starts recorded"
        : rows
            .map((r) => `${r.type}: beat ${r.beat} vs ${r.phaseAtStart.toFixed(3)} (delta ${(r.delta * 1000).toFixed(0)}ms)`)
            .join("; "),
    );
  });

  /* --- 90: the sound preference persists; the gesture gate does not.
     Playwright pre-grants user activation on navigation AND allows
     autoplay, so "no gesture has occurred" is unreproducible here. The gate
     therefore asserts the app's side of the contract mechanically: the
     restored context is DRIVEN into the suspended state a real browser
     hands over (ctx.suspend() right at hydration, before playback's first
     beat), three beats then cross in silence (the engine's state guard),
     and one real click resumes it through the app's own gesture listener
     and sound follows. The UA-side link — that a gesture-less context
     starts suspended — is Chrome's documented autoplay behavior. --- */
  await block("sound-persist", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem("salvage:sound", "1");
      } catch {}
      window.__acCount = 0;
      window.__oscStarts = [];
      const Orig = window.AudioContext;
      const Wrapped = function (...args) {
        const inst = new Orig(...args);
        window.__acCount++;
        window.__acLast = inst;
        return inst;
      };
      Wrapped.prototype = Orig.prototype;
      window.AudioContext = Wrapped;
      const origStart = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (when) {
        window.__oscStarts.push({ when: when ?? 0 });
        return origStart.call(this, when);
      };
    });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await waitHydrated(page);
    /* Hydrated but parked ("0.000") — suspend NOW, before the first beat. */
    await page.evaluate(async () => {
      if (window.__acLast) await window.__acLast.suspend();
    });
    await waitT(page, 3.5);

    const before = await page.evaluate(() => ({
      toggleOn: document.querySelector("[data-sound-toggle]")?.getAttribute("data-on") ?? null,
      acCount: window.__acCount,
      state: window.__acLast ? window.__acLast.state : null,
      oscStarts: window.__oscStarts.length,
    }));

    /* One real gesture (not the toggle — that would turn sound OFF); the
       remaining beats (4.4, 10.0) must then sound. */
    await page.mouse.click(200, 100);
    await page
      .waitForFunction(() => window.__acLast && window.__acLast.state === "running", null, { timeout: 5000 })
      .catch(() => {});
    await waitT(page, 10.5);
    const after = await page.evaluate(() => ({
      state: window.__acLast ? window.__acLast.state : null,
      oscStarts: window.__oscStarts.length,
    }));

    check(
      90,
      'salvage:sound=1 persists across reload: toggle "on" with no prompt, ONE restored AudioContext; while suspended, three crossed beats stay silent; a real click resumes it and sound follows',
      before.toggleOn === "true" &&
        before.acCount === 1 &&
        before.state === "suspended" &&
        before.oscStarts === 0 &&
        after.state === "running" &&
        after.oscStarts > 0,
      `after reload at t=3.5: toggle data-on ${JSON.stringify(before.toggleOn)} (need "true"), ${before.acCount} AudioContext(s) (need 1), ` +
        `state ${JSON.stringify(before.state)} (need "suspended"), oscillator starts ${before.oscStarts} (need 0 — three beats had crossed); ` +
        `after gesture: state ${JSON.stringify(after.state)} (need "running"), starts ${after.oscStarts} (need > 0)`,
    );
    await ctx.close();
  });

  /* --- 91 + 92 + 96 + 98 + 99: change 16 — design-scale screen, notch,
         mark reserve, headline, ground. One reduced-motion load per
         viewport: all of these are static geometry, and reduced motion
         renders the settled SSR state with the thread visible. --- */
  await block("scale-16", async () => {
    const reads = [];
    for (const vp of [
      { w: 390, h: 844 },
      { w: 1440, h: 900 },
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      const g = await page.evaluate(() => {
        const sec1 = document.querySelector('[data-section="call"]');
        const screen = sec1?.querySelector("[data-phone-screen]");
        const bubble = sec1?.querySelector("[data-bubble]");
        if (!sec1 || !screen || !bubble) return null;
        const sr = screen.getBoundingClientRect();
        const brect = bubble.getBoundingClientRect();
        /* Rendered font size = computed (design px, zoom-local) × the
           bubble's own rendered-to-layout ratio, so a probe that pins the
           TEXT while the screen still zooms — or unpins the screen — reads
           red either way. */
        const zoom = bubble.offsetWidth > 0 ? brect.width / bubble.offsetWidth : NaN;
        const renderedFS = parseFloat(getComputedStyle(bubble).fontSize) * zoom;

        /* 92: notch vs signal/wifi in every rendered phone screen. */
        const notchHits = [];
        for (const scr of document.querySelectorAll("[data-phone-screen]")) {
          const notch = scr.querySelector("[data-notch]");
          if (!notch) continue;
          const nr = notch.getBoundingClientRect();
          if (nr.width === 0) continue;
          for (const glyph of scr.querySelectorAll('[data-glyph="signal"], [data-glyph="wifi"]')) {
            const gr = glyph.getBoundingClientRect();
            if (gr.width === 0) continue;
            const hit = gr.left < nr.right && gr.right > nr.left && gr.top < nr.bottom && gr.bottom > nr.top;
            if (hit) notchHits.push(`${glyph.dataset.glyph}@${Math.round(gr.left)},${Math.round(gr.top)}`);
          }
        }
        const notchCount = document.querySelectorAll("[data-notch]").length;

        /* 96: kicker tracking + mark vs device/headline boxes, all sections.
           Sections stack in one coordinate space — no scrolling needed. */
        const markProblems = [];
        let kickerBad = null;
        for (const sec of document.querySelectorAll("[data-section]")) {
          const mark = sec.querySelector("[data-section-mark]");
          if (!mark) continue;
          const kicker = mark.querySelector("p");
          const kcs = getComputedStyle(kicker);
          const ls = parseFloat(kcs.letterSpacing);
          const fs = parseFloat(kcs.fontSize);
          if (!(Number.isFinite(ls) ? ls / fs <= 0.08 : kcs.letterSpacing === "normal"))
            kickerBad = `${sec.dataset.section}: ${kcs.letterSpacing} @ ${kcs.fontSize}`;
          const mr = mark.getBoundingClientRect();
          const targets = [
            ...sec.querySelectorAll("[data-phone-device]"),
            ...sec.querySelectorAll("h1"),
          ];
          for (const t of targets) {
            const tr = t.getBoundingClientRect();
            if (tr.width === 0) continue;
            const hit = tr.left < mr.right && tr.right > mr.left && tr.top < mr.bottom && tr.bottom > mr.top;
            if (hit)
              markProblems.push(
                `${sec.dataset.section}: mark(${Math.round(mr.bottom)}b) ∩ ${t.tagName}(${Math.round(tr.top)}t)`,
              );
          }
        }

        /* 98: headline line boxes. */
        const h1 = document.querySelector("h1");
        const h1cs = h1 ? getComputedStyle(h1) : null;
        const h1lines = h1 ? Math.round(h1.getBoundingClientRect().height / parseFloat(h1cs.lineHeight)) : null;

        /* 99: section 4 ground === section 1 ground. */
        const sec4 = document.querySelector('[data-section="math"]');
        return {
          screenW: sr.width,
          renderedFS,
          ratio: renderedFS / sr.width,
          notchHits,
          notchCount,
          kickerBad,
          markProblems,
          h1lines,
          h1fs: h1cs?.fontSize ?? null,
          bg1: getComputedStyle(sec1).backgroundColor,
          bg4: sec4 ? getComputedStyle(sec4).backgroundColor : null,
        };
      });
      reads.push({ vp: `${vp.w}x${vp.h}`, g });
      await ctx.close();
    }

    const WANT = 17 / 390;
    const ratioOk = (g) => g != null && Number.isFinite(g.ratio) && Math.abs(g.ratio - WANT) / WANT <= 0.02;
    check(
      91,
      "first-bubble rendered font-size ÷ rendered screen width === 17/390 ±2%, both viewports",
      reads.length === 2 && reads.every((r) => ratioOk(r.g)),
      reads
        .map(
          (r) =>
            `${r.vp} -> ${r.g ? `${r.g.renderedFS.toFixed(2)}px / ${r.g.screenW.toFixed(1)}px = ${r.g.ratio?.toFixed(5)}` : "nodes missing"} ` +
            `(want ${WANT.toFixed(5)} ±2%)`,
        )
        .join(" | "),
    );

    check(
      92,
      "signal + wifi glyph boxes intersect no notch, every rendered phone, both viewports",
      reads.every((r) => r.g != null && r.g.notchCount > 0 && r.g.notchHits.length === 0),
      reads
        .map((r) => `${r.vp} -> ${r.g?.notchCount ?? 0} notch(es), hits ${JSON.stringify(r.g?.notchHits ?? null)}`)
        .join(" | "),
    );

    check(
      96,
      "kicker letter-spacing <= 0.08em; the mark box intersects no device or headline box — all sections, both viewports",
      reads.every((r) => r.g != null && r.g.kickerBad == null && r.g.markProblems.length === 0),
      reads
        .map(
          (r) =>
            `${r.vp} -> kicker ${r.g?.kickerBad ?? "ok"}; intersections ${JSON.stringify(r.g?.markProblems ?? null)}`,
        )
        .join(" | "),
    );

    const m = reads[0].g;
    check(
      98,
      "section 2 headline at 390 wraps to <= 3 line boxes",
      m != null && m.h1lines != null && m.h1lines <= 3,
      `${m?.h1lines ?? "?"} line box(es) at ${m?.h1fs ?? "?"} (need <= 3)`,
    );

    check(
      99,
      "section 4 computed background === section 1 background (one ground)",
      reads.every((r) => r.g != null && r.g.bg4 != null && r.g.bg4 === r.g.bg1),
      reads.map((r) => `${r.vp} -> s1 ${r.g?.bg1} vs s4 ${r.g?.bg4}`).join(" | "),
    );
  });

  /* --- 93 + 94 + 95: change 16 — the rail gutter and the mobile sections.
         One reduced-motion 390x844 load, walked section by section. --- */
  await block("mobile-16", async () => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    /* 93: nothing renders under the rail, any section. */
    const railHits = [];
    for (let i = 0; i < 4; i++) {
      await goSection(page, i);
      const hits = await page.evaluate((EFF) => {
        const vis = eval(EFF);
        const rail = document.querySelector("[data-rail]");
        if (!rail) return ["no [data-rail]"];
        const rr = rail.getBoundingClientRect();
        const sec = [...document.querySelectorAll("[data-section]")].find((s) => {
          const r = s.getBoundingClientRect();
          return r.top > -10 && r.top < 10;
        });
        if (!sec) return ["no snapped section"];
        /* The RENDERED box: the element's rect clipped by every overflow
           ancestor — a track panel resting off-screen inside its scrollport
           is laid out past the rail but never painted there. */
        const renderedRect = (el) => {
          let r = el.getBoundingClientRect();
          let n = el.parentElement;
          while (n && n !== document.body) {
            const cs = getComputedStyle(n);
            if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
              const cr = n.getBoundingClientRect();
              r = {
                left: Math.max(r.left, cr.left),
                right: Math.min(r.right, cr.right),
                top: Math.max(r.top, cr.top),
                bottom: Math.min(r.bottom, cr.bottom),
              };
              if (r.left >= r.right || r.top >= r.bottom) return null;
            }
            n = n.parentElement;
          }
          return r;
        };
        const bad = [];
        for (const el of sec.querySelectorAll("*")) {
          if (rail.contains(el)) continue;
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const isBox =
            hasText || el.tagName === "svg" || el.tagName === "IMG" || el.hasAttribute("data-phone-device");
          if (!isBox) continue;
          if (vis(el) <= 0.1) continue;
          const r = renderedRect(el);
          if (!r || r.right - r.left === 0 || r.bottom - r.top === 0) continue;
          if (r.left < rr.right && r.right > rr.left && r.top < rr.bottom && r.bottom > rr.top)
            bad.push(`${sec.dataset.section}/${el.tagName}@${Math.round(r.right)}r (rail ${Math.round(rr.left)}..${Math.round(rr.right)})`);
        }
        return bad;
      }, EFF);
      railHits.push(...hits);
    }
    check(
      93,
      "390x844: no content box intersects the rail box, any section",
      railHits.length === 0,
      railHits.length === 0 ? "0 intersections across 4 sections" : railHits.slice(0, 6).join(" | "),
    );

    /* 95: section 2 — the ledger's last line clears the fold by 16px and
       the since-install label survived the fit. */
    await goSection(page, 1);
    const g95 = await page.evaluate(
      ({ EFF, sinceLabel }) => {
        const vis = eval(EFF);
        const strip = document.querySelector("[data-since-strip]");
        const label = strip ? strip.previousElementSibling : null;
        const panel = document.querySelector("[data-panel-content]");
        if (!strip || !panel) return null;
        return {
          stripBottom: strip.getBoundingClientRect().bottom,
          stripVisible: vis(strip) > 0.5,
          labelText: label ? label.textContent.trim() : null,
          labelVisible: label ? vis(label) > 0.5 : false,
          wantLabel: sinceLabel,
        };
      },
      { EFF, sinceLabel },
    );
    check(
      95,
      `section 2 mobile: last ledger line bottom <= viewport bottom - 16; ${JSON.stringify(sinceLabel)} label present`,
      g95 != null &&
        g95.stripVisible &&
        g95.stripBottom <= 844 - 16 &&
        g95.labelVisible &&
        g95.labelText === sinceLabel,
      g95 == null
        ? "since strip or ledger panel not found"
        : `strip bottom ${g95.stripBottom.toFixed(1)} (need <= 828); label ${JSON.stringify(g95.labelText)} ` +
          `visible ${g95.labelVisible} (want ${JSON.stringify(sinceLabel)})`,
    );

    /* 94: section 3 — tiles whole, nothing over them, phone below the cue
       band. */
    await goSection(page, 2);
    const g94 = await page.evaluate((EFF) => {
      const vis = eval(EFF);
      const yours = document.querySelector('[data-section="yours"]');
      if (!yours) return null;
      const yr = yours.getBoundingClientRect();
      const activePanel = [...yours.querySelectorAll("[data-panel]")].find((p) => {
        const r = p.getBoundingClientRect();
        return r.left > -10 && r.left < yr.width;
      });
      const tiles = activePanel ? [...activePanel.querySelectorAll("[data-tile]")] : [];
      const band = yours.querySelector("[data-yours-cueband]");
      const dev = yours.querySelector("[data-phone-device]");
      if (tiles.length !== 3 || !band || !dev) return { tiles: tiles.length, band: !!band, dev: !!dev };
      const overlaps = [];
      for (const tile of tiles) {
        const tr = tile.getBoundingClientRect();
        for (const el of yours.querySelectorAll("*")) {
          if (tile.contains(el) || el.contains(tile)) continue;
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!hasText && !el.hasAttribute("data-phone-device") && el.tagName !== "svg") continue;
          if (vis(el) <= 0.1) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.left < tr.right - 1 && r.right > tr.left + 1 && r.top < tr.bottom - 1 && r.bottom > tr.top + 1)
            overlaps.push(`${el.tagName}@${Math.round(r.top)}t over tile@${Math.round(tr.top)}t`);
        }
      }
      const tilesInside = tiles.every((t) => {
        const r = t.getBoundingClientRect();
        return r.top >= yr.top - 1 && r.bottom <= yr.bottom + 1 && r.left >= yr.left - 1 && r.right <= yr.right + 1;
      });
      return {
        tiles: 3,
        tilesInside,
        overlaps,
        bandBottom: band.getBoundingClientRect().bottom,
        devTop: dev.getBoundingClientRect().top,
      };
    }, EFF);
    check(
      94,
      "section 3 mobile: 3 tiles fully visible, nothing intersects them, phone top > cue band bottom",
      g94 != null &&
        g94.tiles === 3 &&
        g94.tilesInside === true &&
        g94.overlaps.length === 0 &&
        typeof g94.devTop === "number" &&
        g94.devTop > g94.bandBottom,
      g94 == null
        ? "yours section not found"
        : `${g94.tiles} tile(s); inside ${g94.tilesInside}; overlaps ${JSON.stringify(g94.overlaps ?? null)}; ` +
          `phone top ${g94.devTop?.toFixed?.(1)} vs cue band bottom ${g94.bandBottom?.toFixed?.(1)} (need >)`,
    );
    await ctx.close();
  });

  /* --- 97: the keyboard accommodation, visualViewport forced to 420. --- */
  await block("keyboard-16", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(VisualViewport.prototype, "height", {
        get() {
          return 420;
        },
        configurable: true,
      });
    });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await waitHydrated(page);
    await goSection(page, 2);
    await page.focus("[data-name-input]");
    await page.waitForTimeout(250);
    const g = await page.evaluate(() => {
      const header = document.querySelector("[data-crop-biz]");
      const panel = document.querySelector("[data-yours-panel]");
      if (!header || !panel) return null;
      const hr = header.getBoundingClientRect();
      return {
        top: hr.top,
        bottom: hr.bottom,
        pad: getComputedStyle(panel).paddingBottom,
        vvh: window.visualViewport.height,
      };
    });
    check(
      97,
      "visualViewport 420 + name input focused -> section-3 phone contact header inside the visual viewport",
      g != null && g.vvh === 420 && g.top >= -1 && g.bottom <= 421,
      g == null
        ? "header or panel not found"
        : `header ${g.top.toFixed(1)}..${g.bottom.toFixed(1)} (need within 0..420); panel padding-bottom ${g.pad}; vv height ${g.vvh}`,
    );
    await ctx.close();
  });

  /* --- 100: the design-scale thread reserve fits every preset's thread. --- */
  await block("reserve-16", async () => {
    const rows = [];
    for (const p of presets) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      await page.goto(`${base}/?biz=${p.id}`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      const g = await page.evaluate(() => {
        const sec1 = document.querySelector('[data-section="call"]');
        const screen = sec1?.querySelector("[data-phone-screen]");
        const bubbles = sec1 ? [...sec1.querySelectorAll("[data-bubble]")] : [];
        const delivered = sec1?.querySelector("[data-delivered]");
        if (!screen || bubbles.length === 0 || !delivered) return null;
        const sr = screen.getBoundingClientRect();
        const inside = (r) => r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5;
        const clipped = bubbles.filter((b) => !inside(b.getBoundingClientRect())).length;
        return {
          total: bubbles.length,
          clipped,
          deliveredInside: inside(delivered.getBoundingClientRect()),
          reserveDesign: sec1.querySelector("[data-thread-viewport]")?.clientHeight ?? null,
        };
      });
      rows.push({ id: p.id, g });
      await ctx.close();
    }
    check(
      100,
      "thread reserve at 390 fits the longest thread: 0 clipped bubbles + Delivered inside the screen, all presets",
      rows.length === presets.length &&
        rows.every(
          (r) => r.g != null && r.g.total > 0 && r.g.clipped === 0 && r.g.deliveredInside === true,
        ),
      rows
        .map(
          (r) =>
            `${r.id}: ${r.g ? `${r.g.clipped}/${r.g.total} clipped, delivered inside ${r.g.deliveredInside}, reserve ${r.g.reserveDesign}px design` : "nodes missing"}`,
        )
        .join(" | "),
    );
  });

  /* --- 101 + 102 + 103 + 105 + 106: change 17 — glass and aluminum. --- */
  await block("device-17", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    /* Call-screen pass: sample while the call is still ringing. */
    await waitT(page, 0.8);
    const g101 = await page.evaluate(() => {
      const sec1 = document.querySelector('[data-section="call"]');
      const screen = sec1?.querySelector("[data-phone-screen]");
      /* RENDERED buttons only — a display:none grid is not a grid. */
      const buttons = sec1
        ? [...sec1.querySelectorAll("[data-call-grid-btn]")].filter(
            (b) => b.getBoundingClientRect().width > 0,
          )
        : [];
      const end = sec1?.querySelector("[data-call-end-btn]");
      const name = sec1?.querySelector("[data-call-biz]");
      const status = sec1?.querySelector("[data-call-status]");
      if (!screen || !end || !name || !status) return null;
      const sr = screen.getBoundingClientRect();
      const zoom = sr.width / 390;
      const er = end.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      const str = status.getBoundingClientRect();
      return {
        buttons: buttons.length,
        endGapDesign: (sr.bottom - er.bottom) / zoom,
        centerDeltaDesign: Math.abs((nr.left + nr.right) / 2 - (str.left + str.right) / 2) / zoom,
      };
    });
    check(
      101,
      "call screen: exactly 6 grid buttons; End circle bottom 64±8px above the screen bottom (design scale); name and status centers within 2px",
      g101 != null &&
        g101.buttons === 6 &&
        Math.abs(g101.endGapDesign - 64) <= 8 &&
        g101.centerDeltaDesign <= 2,
      g101 == null
        ? "call screen nodes not found"
        : `${g101.buttons} grid button(s) (need 6); End gap ${g101.endGapDesign.toFixed(1)}px design (need 64±8); ` +
          `name/status center delta ${g101.centerDeltaDesign.toFixed(2)}px (need <= 2)`,
    );

    const g102 = await page.evaluate(() => {
      const dev = document.querySelector('[data-section="call"] [data-phone-device]');
      const screen = dev?.querySelector("[data-phone-screen]");
      if (!dev || !screen) return null;
      const sr = screen.getBoundingClientRect();
      const nubs = [...dev.querySelectorAll("[data-nub]")];
      const outside = nubs.every((n) => {
        const r = n.getBoundingClientRect();
        return r.right <= sr.left + 0.5 || r.left >= sr.right - 0.5;
      });
      const spec = dev.querySelector("[data-specular]");
      const streak = dev.querySelector("[data-screen-streak]");
      return {
        nubs: nubs.length,
        outside,
        specular: spec ? getComputedStyle(spec).pointerEvents : null,
        streak: streak ? getComputedStyle(streak).pointerEvents : null,
      };
    });
    check(
      102,
      "3 nub elements with boxes outside the screen area; bezel specular + screen streak present with pointer-events none",
      g102 != null &&
        g102.nubs === 3 &&
        g102.outside === true &&
        g102.specular === "none" &&
        g102.streak === "none",
      g102 == null
        ? "device nodes not found"
        : `${g102.nubs} nub(s) (need 3), outside screen ${g102.outside}; specular pointer-events ${JSON.stringify(g102.specular)}, ` +
          `streak ${JSON.stringify(g102.streak)} (both need "none")`,
    );

    /* Banner pass: t=4.8, the banner is landed and clamped. */
    await waitT(page, 4.8);
    const g103 = await page.evaluate(() => {
      const sec1 = document.querySelector('[data-section="call"]');
      const body = sec1?.querySelector("[data-banner-body]");
      const banner = sec1?.querySelector("[data-banner]");
      const notch = sec1?.querySelector("[data-notch]");
      if (!body || !banner || !notch) return null;
      const lh = parseFloat(getComputedStyle(body).lineHeight);
      const lines = Math.round(body.getBoundingClientRect().height / (lh * (body.getBoundingClientRect().width / body.offsetWidth)));
      const br = banner.getBoundingClientRect();
      const nr = notch.getBoundingClientRect();
      const hit = br.left < nr.right && br.right > nr.left && br.top < nr.bottom && br.bottom > nr.top;
      return { lines, hit, bannerTop: br.top, notchBottom: nr.bottom };
    });
    check(
      103,
      "banner body renders exactly 2 line boxes at t=4.8; banner box intersects no notch",
      g103 != null && g103.lines === 2 && g103.hit === false,
      g103 == null
        ? "banner nodes not found"
        : `${g103.lines} line box(es) (need 2); banner top ${g103.bannerTop.toFixed(1)} vs notch bottom ${g103.notchBottom.toFixed(1)}, ` +
          `intersects ${g103.hit} (need false)`,
    );

    /* Settled pass: bubbles + mask. */
    await waitT(page, 6.0);
    const g105 = await page.evaluate(() => {
      const sec1 = document.querySelector('[data-section="call"]');
      const bubble = sec1?.querySelector('[data-bubble="business"]');
      const screen = sec1?.querySelector("[data-phone-screen]");
      const vp = sec1?.querySelector("[data-thread-viewport]");
      if (!bubble || !screen || !vp) return null;
      const lum = (c) => {
        const m = c.match(/\d+(\.\d+)?/g).map(Number);
        const f = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
      };
      const bb = getComputedStyle(bubble).backgroundColor;
      const sb = getComputedStyle(screen).backgroundColor;
      const l1 = lum(bb);
      const l2 = lum(sb);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const cs = getComputedStyle(vp);
      const mask = cs.maskImage !== "none" ? cs.maskImage : cs.webkitMaskImage;
      return { bb, sb, ratio, mask };
    });
    check(
      105,
      "business bubble computed bg sits >= 2 luminance steps over the screen ground (contrast ratio >= 1.4)",
      g105 != null && g105.ratio >= 1.4,
      g105 == null
        ? "bubble/screen not found"
        : `bubble ${g105.bb} vs screen ${g105.sb} -> contrast ${g105.ratio.toFixed(3)} (need >= 1.4)`,
    );
    check(
      106,
      "thread container has a mask-image",
      g105 != null && g105.mask != null && g105.mask !== "none",
      g105 == null ? "thread viewport not found" : `mask-image ${String(g105.mask).slice(0, 80)}`,
    );
    await ctx.close();
  });

  /* --- 104: the dates are real — config weekday, request-time month/rows. --- */
  await block("dates-17", async () => {
    const lockDate = need(/lockDate:\s*"([^"]+)"/, "COPY.chrome.phone.lockDate");
    const NY = "America/New_York";
    const now = new Date();
    const wantMonth = new Intl.DateTimeFormat("en-US", { timeZone: NY, month: "long", year: "numeric" }).format(now);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: NY, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
    const num = (t) => Number(parts.find((p) => p.type === t).value);
    const wantRow0 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(num("year"), num("month") - 1, num("day")),
    );
    const page = await getPage("");
    const month = elementsIn(page.html, "data-ledger-month");
    const row0Date = elementsIn(page.html, 'data-caught-date="0"');
    check(
      104,
      `lockDate === "Thursday, March 12"; ledger month === gate-computed ${wantMonth}; row[0] date === today (${wantRow0})`,
      lockDate === "Thursday, March 12" &&
        month.length === 1 &&
        month[0] === wantMonth &&
        row0Date.length === 1 &&
        row0Date[0] === wantRow0,
      `config lockDate ${JSON.stringify(lockDate)}; rendered month ${JSON.stringify(month[0] ?? null)} (want ${JSON.stringify(wantMonth)}); ` +
        `row[0] date ${JSON.stringify(row0Date[0] ?? null)} (want ${JSON.stringify(wantRow0)})`,
    );
  });

  /* --- 107: nothing pops — screens hold at 0 until fonts.ready. --- */
  await block("fonts-17", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      let release;
      const held = new Promise((r) => {
        release = r;
      });
      window.__releaseFonts = release;
      Object.defineProperty(FontFaceSet.prototype, "ready", {
        get() {
          return held;
        },
        configurable: true,
      });
    });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await waitHydrated(page);
    const before = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-section="call"] [data-phone-screen]')).opacity,
    );
    await page.evaluate(() => window.__releaseFonts());
    await page.waitForTimeout(500);
    const after = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-section="call"] [data-phone-screen]')).opacity,
    );
    check(
      107,
      "phone screen opacity 0 before fonts.ready (held stub) and 1 after it resolves",
      before === "0" && after === "1",
      `before ${JSON.stringify(before)} (need "0"), after ${JSON.stringify(after)} (need "1")`,
    );
    await ctx.close();
  });

  /* --- 108: the Lighthouse budget, live URL only. Local runs cannot stand
         in for the deployed CDN path, so the gate asserts only against
         https bases; the deploy step's live re-gate is where it bites. --- */
  await block("perf-17", async () => {
    if (!base.startsWith("https://")) {
      check(
        108,
        "Lighthouse mobile LCP <= 2.5s, CLS <= 0.05",
        true,
        "live-only gate: asserted on the deployed URL re-gate, not localhost",
      );
      return;
    }
    let lighthouse, launcher;
    try {
      const req = createRequire(import.meta.url);
      lighthouse = (await import(req.resolve("lighthouse"))).default;
      launcher = req("chrome-launcher");
    } catch (err) {
      check(108, "Lighthouse mobile LCP <= 2.5s, CLS <= 0.05", false, `lighthouse unavailable: ${err.message}`);
      return;
    }
    const chrome = await launcher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
    try {
      const result = await lighthouse(base + "/", {
        port: chrome.port,
        onlyCategories: ["performance"],
        output: "json",
      });
      const a = result.lhr.audits;
      const lcp = a["largest-contentful-paint"].numericValue;
      const cls = a["cumulative-layout-shift"].numericValue;
      check(
        108,
        "Lighthouse mobile (Moto G Power, slow 4G): LCP <= 2.5s, CLS <= 0.05",
        lcp <= 2500 && cls <= 0.05,
        `LCP ${(lcp / 1000).toFixed(2)}s (need <= 2.5s), CLS ${cls.toFixed(3)} (need <= 0.05), ` +
          `perf score ${Math.round((result.lhr.categories.performance?.score ?? 0) * 100)}`,
      );
    } finally {
      await chrome.kill();
    }
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
  console.log(`  ${r.retired ? "RETIRED" : r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
}

const failed = results.filter((r) => !r.pass);
console.log(
  failed.length === 0
    ? `\nALL ${results.length} GATES PASS`
    : `\n${failed.length} GATE(S) RED: ${failed.map((r) => r.n).join(", ")}`,
);

/* exitCode, not exit(): let libuv tear the fetch handles down cleanly on Windows. */
process.exitCode = failed.length === 0 ? 0 : 1;
