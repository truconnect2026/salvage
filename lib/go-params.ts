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
import { COPY, PRESETS, resolveName, type Preset } from "@/lib/client.config";

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

export function jobsFor(p: GoParams): readonly string[] {
  if (p.trade) return COPY.jobs[p.trade];
  /* home always resolves a trade; the fallback only satisfies the type. */
  return p.presetId === "home" ? COPY.jobs.plumbing : COPY.jobs[p.presetId];
}

/** The OG route's query, rebuilt from the RESOLVED values — never the raw
    request string. */
export function ogQuery(p: GoParams): string {
  const q = new URLSearchParams({ biz: p.biz, preset: p.presetId });
  if (p.trade) q.set("trade", p.trade);
  return q.toString();
}
