/*
 * Rendered-state gates.  Usage:  node scripts/gate.mjs <baseUrl>
 *
 * Standing rule 5: rendered state is the only truth.  Every expectation is read
 * out of this repo's lib/client.config.ts; every observed value is read out of
 * HTML and bytes served by <baseUrl>.  Nothing asserts on class names.
 */
import { readFileSync } from "node:fs";
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

const startIdx = src.indexOf(`id: "${defaultId}"`);
if (startIdx === -1) throw new Error(`gate setup: preset "${defaultId}" not found`);
const nextIdx = src.indexOf('id: "', startIdx + 6);
const block = src.slice(startIdx, nextIdx === -1 ? src.length : nextIdx);

const pick = (re, label) => {
  const m = block.match(re);
  if (!m) throw new Error(`gate setup: could not read ${label} for preset "${defaultId}"`);
  return m[1];
};

const expected = {
  bizName: pick(/bizName:\s*"([^"]+)"/, "bizName"),
  ticket: Number(pick(/ticket:\s*(\d+)/, "ticket")),
  missedPerMonth: Number(pick(/missedPerMonth:\s*(\d+)/, "missedPerMonth")),
  callsCaught: Number(pick(/callsCaught:\s*(\d+)/, "callsCaught")),
  recovered: Number(pick(/recovered:\s*(\d+)/, "recovered")),
  bubbles: (block.match(/\{\s*from:/g) ?? []).length,
  ctaHref,
};

/* Independent reimplementation of lib/format.ts — deliberately not imported. */
const usd = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/* ---------- observations: read from the served response ------------------ */

const res = await fetch(base, { headers: { "cache-control": "no-cache" } });
if (!res.ok) throw new Error(`gate setup: GET ${base} returned ${res.status}`);
const raw = await res.text();

/* Strip <script> so the RSC flight payload cannot satisfy a DOM assertion. */
const html = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

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

const elements = (attr) => {
  // Matches an element carrying `attr`, capturing its inner HTML. Marked
  // elements never nest another element of the same tag, so the lazy close is safe.
  const pattern = "<([a-z]+)(?=[^>]*\\s" + attr + "[\\s=>])[^>]*>([\\s\\S]*?)</\\1>";
  const re = new RegExp(pattern, "gi");
  return [...html.matchAll(re)].map((m) => decode(m[2]));
};

const observed = {
  bubbles: (html.match(/data-bubble="/g) ?? []).length,
  ledger: elements("data-ledger-recovered"),
  calls: elements("data-calls-caught"),
  math: elements("data-math"),
  biz: elements("data-biz-name"),
  anchors: [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/gi)].map((m) => m[1]),
};

/* og.png is asserted as served, not as a local file, so the live gate is real. */
const ogRes = await fetch(`${base}/og.png`, { headers: { "cache-control": "no-cache" } });
let ogDims = null;
let ogNote = `HTTP ${ogRes.status}`;
if (ogRes.ok) {
  const buf = Buffer.from(await ogRes.arrayBuffer());
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") {
    ogNote = `not a PNG (magic ${sig})`;
  } else {
    ogDims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    ogNote = `${ogDims.w}x${ogDims.h}, ${buf.length} bytes`;
  }
}

/* ---------- assertions --------------------------------------------------- */

const results = [];
const check = (n, name, pass, detail) => results.push({ n, name, pass, detail });

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

check(
  7,
  "og.png served at 2400x1260",
  ogDims !== null && ogDims.w === 2400 && ogDims.h === 1260,
  `${base}/og.png -> ${ogNote}`,
);

/* ---------- report ------------------------------------------------------- */

console.log(`gate: ${base}  (preset "${defaultId}")`);
for (const r of results) {
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name} — ${r.detail}`);
}

const failed = results.filter((r) => !r.pass);
console.log(failed.length === 0 ? "\nALL 7 GATES PASS" : `\n${failed.length} GATE(S) RED: ${failed.map((r) => r.n).join(", ")}`);
/* exitCode, not exit(): let libuv tear the fetch handles down cleanly on Windows. */
process.exitCode = failed.length === 0 ? 0 : 1;
