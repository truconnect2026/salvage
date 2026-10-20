/**
 * change 42: the /go URL contract, server side. Reads lib/client.config.ts
 * so the client bundle does not have to — GoCard gets the resolved strings
 * as props.
 *
 *   biz     display name; the demo's own sanitizer (resolveName) and cap
 *   preset  salon | home | dental | other         (default home)
 *   trade   plumbing | hvac | electrical | roofing | garage (home only;
 *           default plumbing)
 *   demo=1  demo mode — also on whenever biz is empty
 *   ref, lead  pass-through only: kept to a URL-safe alphabet, never shown
 */
import { COPY, GO_SCHEDULE, PRESETS, resolveName, type Preset } from "@/lib/client.config";
import { fillN, hoursLine, typicalReply } from "@/lib/go";

export type GoPresetId = "salon" | "home" | "dental" | "other";
export type Trade = "plumbing" | "hvac" | "electrical" | "roofing" | "garage";

const PRESET_IDS: GoPresetId[] = ["salon", "home", "dental", "other"];
const TRADES: Trade[] = ["plumbing", "hvac", "electrical", "roofing", "garage"];

export type GoParams = {
  /** Sanitized display name; the preset's own name when biz is empty. */
  biz: string;
  preset: Preset;
  presetId: GoPresetId;
  /** Only the home preset carries a trade. */
  trade: Trade | null;
  demo: boolean;
  ref: string;
  lead: string;
};

type SP = { [key: string]: string | string[] | undefined };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const passThrough = (v: string | string[] | undefined) => one(v).replace(/[^\w.-]/g, "").slice(0, 64);

export function resolveGoParams(sp: SP): GoParams {
  const biz = resolveName(sp.biz);
  const rawPreset = one(sp.preset) as GoPresetId;
  const presetId: GoPresetId = PRESET_IDS.includes(rawPreset) ? rawPreset : "home";
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const rawTrade = one(sp.trade) as Trade;
  const trade: Trade | null = presetId === "home" ? (TRADES.includes(rawTrade) ? rawTrade : "plumbing") : null;
  return {
    biz: biz || preset.bizName,
    preset,
    presetId,
    trade,
    demo: one(sp.demo) === "1" || biz.length === 0,
    ref: passThrough(sp.ref),
    lead: passThrough(sp.lead),
  };
}

/** The line under the name: the trade for home, the preset's own label for
    salon and dental, nothing for "other" — "Something else" names a tab,
    not a business. */
export function tradeLabel(p: GoParams): string {
  if (p.trade) return COPY.tradeLabels[p.trade];
  if (p.presetId === "other") return "";
  return p.preset.label;
}

/** change 45: each job with the key of its hand-drawn glyph
    (app/go/glyphs.tsx): "<set>-<index>", or "else" for the label EVERY set
    shares — found from the data, not named in code. */
export type GoJob = { label: string; glyph: string };
const JOB_SETS = Object.values(COPY.jobs) as readonly (readonly string[])[];
const SHARED_JOBS = new Set(JOB_SETS[0].filter((j) => JOB_SETS.every((set) => set.includes(j))));

export function jobSet(p: GoParams): keyof typeof COPY.jobs {
  if (p.trade) return p.trade;
  /* home always resolves a trade; the fallback only satisfies the type. */
  return p.presetId === "home" ? "plumbing" : p.presetId;
}

export function jobsFor(p: GoParams): GoJob[] {
  const set = jobSet(p);
  return COPY.jobs[set].map((label, i) => ({ label, glyph: SHARED_JOBS.has(label) ? "else" : `${set}-${i}` }));
}

/** change 45: the proof row — every figure from config data. */
export function proofFor(p: GoParams) {
  const reply = typicalReply(p.preset.thread);
  return {
    radius: fillN(COPY.go.proofRadius, p.preset.radius),
    hoursLabel: COPY.go.proofHours,
    hours: hoursLine(GO_SCHEDULE),
    reply: reply == null ? null : fillN(COPY.go.proofReply, reply),
    replyMinutes: reply,
  };
}

/** change 45 (F10): demo mode's standing owner card — the preset's STORED
    caller and the trade's first job. The visitor's own booking lands on
    top of it. */
export function sampleFor(p: GoParams): { name: string; job: string } | null {
  if (!p.demo) return null;
  return { name: p.preset.customerName, job: COPY.jobs[jobSet(p)][0] };
}

/** The OG route's query, rebuilt from the RESOLVED values — never the raw
    request string. */
export function ogQuery(p: GoParams): string {
  const q = new URLSearchParams({ biz: p.biz, preset: p.presetId });
  if (p.trade) q.set("trade", p.trade);
  return q.toString();
}
