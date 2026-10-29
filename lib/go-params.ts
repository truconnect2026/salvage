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
import { GO_COPY, GO_SCHEDULE, JOB_GLYPH, PRESETS, resolveName, type Preset } from "@/lib/client.config";
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
    /* change 54: a door with no name shows its own kind of shop's name
       (config defaultNames), else the preset's stored one. */
    biz: biz || GO_COPY.defaultNames[trade ?? presetId] || preset.bizName,
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
  if (p.trade) return GO_COPY.tradeLabels[p.trade];
  if (p.presetId === "other") return "";
  return p.preset.label;
}

/** change 45 / 45.1: each job with the id of its hand-drawn glyph, looked
    up by the job's own STRING (config JOB_GLYPH) — a reordered list keeps
    every glyph on its job. An unmapped job gets no glyph (gate 223 red). */
export type GoJob = { label: string; glyph: string };

export function jobSet(p: GoParams): keyof typeof GO_COPY.jobs {
  if (p.trade) return p.trade;
  /* home always resolves a trade; the fallback only satisfies the type. */
  return p.presetId === "home" ? "plumbing" : p.presetId;
}

export function jobsFor(p: GoParams): GoJob[] {
  const set = jobSet(p);
  return GO_COPY.jobs[set].map((label) => ({ label, glyph: JOB_GLYPH[label] ?? "" }));
}

/** change 45.1: this door's schedule — the shared starts plus the preset's
    own hours. */
export function scheduleFor(p: GoParams) {
  return { ...GO_SCHEDULE, ...p.preset.hours };
}

/** change 54: the strings each kind of shop words its own way — the photo
    tile, its done line and the pre-filled text (config GO_COPY.doors). */
export function doorCopy(p: GoParams) {
  const d = GO_COPY.doors[p.presetId];
  return { quote: d.quote, quoteDoneSub: d.quoteDoneSub, smsBody: d.smsBody };
}

/** change 45: the proof row — every figure from config data. change 45.1:
    demo mode only; a live door has no data of its own to prove with. */
export function proofFor(p: GoParams) {
  if (!p.demo) return null;
  const reply = typicalReply(p.preset.thread);
  return {
    /* change 53: a preset with no service radius (salon) shows no line. */
    radius: p.preset.radius == null ? null : fillN(GO_COPY.go.proofRadius, p.preset.radius),
    hoursLabel: GO_COPY.go.proofHours,
    hours: hoursLine(scheduleFor(p)),
    reply: reply == null ? null : fillN(GO_COPY.go.proofReply, reply),
    replyMinutes: reply,
  };
}

/** change 45 (F10): demo mode's standing owner card — the preset's STORED
    caller and the trade's first job. The visitor's own booking lands on
    top of it. */
export function sampleFor(p: GoParams): { name: string; job: string } | null {
  if (!p.demo) return null;
  return { name: p.preset.customerName, job: GO_COPY.jobs[jobSet(p)][0] };
}

/** The OG route's query, rebuilt from the RESOLVED values — never the raw
    request string. */
export function ogQuery(p: GoParams): string {
  const q = new URLSearchParams({ biz: p.biz, preset: p.presetId });
  if (p.trade) q.set("trade", p.trade);
  return q.toString();
}
