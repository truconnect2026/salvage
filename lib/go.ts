/**
 * change 42: the /go customer page's pure logic. No React, no DOM, no demo
 * engine, no config — app/go/page.tsx (server) and app/go/GoCard.tsx
 * (client) both import it, so the server's first paint and the client's
 * later reads resolve the same slots.
 *
 * Every clock read is America/New_York and DST-correct: wall times are
 * turned into instants with the zone's offset AT THAT INSTANT, never the
 * offset of "now" (gate 209 freezes the clock on 2026-11-01 01:30 ET, the
 * fall-back hour, to hold this). change 45: the zone, hours and starts are
 * config data (GO_SCHEDULE), passed in.
 */
/* No config import: this module ships in the client bundle. The copy AND
   the schedule (change 45: hours are config data — GO_SCHEDULE) travel as
   props from the server instead. */
export type Schedule = {
  tz: string;
  /** Open weekdays, 0 = Sunday. Sunday is never open whatever this says. */
  days: number[];
  open: number;
  close: number;
  starts: [number, number][];
  slotMinutes: number;
  /** A start must be at least this far out — "never a past slot" includes
      the one that begins while the customer is still typing. */
  leadMinutes: number;
  openDays: number;
};

export const fill = (s: string, biz: string) => s.replace(/\{biz\}/g, () => biz);
/** Fills {n} — a figure from data, never a hand-typed number. */
export const fillN = (s: string, n: number | string) => s.replace(/\{n\}/g, () => String(n));

/* ---------- clock: the schedule's zone ---------------------------------- */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = tz + "|" + key;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    fmtCache.set(k, f);
  }
  return f;
}

export type ZonedParts = { y: number; m: number; d: number; h: number; min: number; s: number; dow: number };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(ms: number, tz: string): ZonedParts {
  const parts = fmt(tz, "parts", {
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: +get("year"),
    m: +get("month"),
    d: +get("day"),
    h: +get("hour") % 24,
    min: +get("minute"),
    s: +get("second"),
    dow: DOW.indexOf(get("weekday")),
  };
}

/** The offset of `tz` (ms, local minus UTC) at instant `ms`. */
function offsetAt(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/** The instant a wall time in `tz` names. Two passes settle the offset
    across a transition (the offset is read AT the answer, never at "now");
    a wall time inside the spring-forward gap lands an hour late, the
    fall-back hour resolves to its first occurrence. No start sits in
    either hour. */
export function wallToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const wall = Date.UTC(y, m - 1, d, h, min);
  let t = wall - offsetAt(wall, tz);
  t = wall - offsetAt(t, tz);
  return t;
}

export function isOpenAt(ms: number, sch: Schedule): boolean {
  const p = zonedParts(ms, sch.tz);
  if (p.dow === 0 || !sch.days.includes(p.dow)) return false;
  const mins = p.h * 60 + p.min;
  return mins >= sch.open * 60 && mins < sch.close * 60;
}

/** Minutes past midnight in the schedule's zone — the dial's hand. */
export function minuteOfDay(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return p.h * 60 + p.min;
}

/** Is today, in the zone, an open day at all — the dial's arc ink. */
export function openToday(ms: number, sch: Schedule): boolean {
  const dow = zonedParts(ms, sch.tz).dow;
  return dow !== 0 && sch.days.includes(dow);
}

export type Slot = { start: number; label: string; time: string };
export type SlotDay = { key: string; label: string; dow: string; date: string; slots: Slot[] };

/** The next openDays days with at least one bookable start, Sundays
    skipped, past and inside-the-lead starts dropped. */
export function openDays(nowMs: number, sch: Schedule, days = sch.openDays): SlotDay[] {
  const today = zonedParts(nowMs, sch.tz);
  const timeFmt = fmt(sch.tz, "time", { hour: "numeric", minute: "2-digit" });
  const dayFmt = fmt(sch.tz, "day", { weekday: "short", month: "short", day: "numeric" });
  const dowFmt = fmt(sch.tz, "dow", { weekday: "short" });
  const dateFmt = fmt(sch.tz, "date", { month: "short", day: "numeric" });
  const out: SlotDay[] = [];
  for (let i = 0; out.length < days && i < 14; i++) {
    /* Calendar arithmetic on a bare date — no zone, so no offset can move
       the day. */
    const cal = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const wd = cal.getUTCDay();
    if (wd === 0 || !sch.days.includes(wd)) continue;
    const y = cal.getUTCFullYear();
    const m = cal.getUTCMonth() + 1;
    const d = cal.getUTCDate();
    const slots: Slot[] = [];
    for (const [h, min] of sch.starts) {
      const start = wallToUtc(y, m, d, h, min, sch.tz);
      if (start < nowMs + sch.leadMinutes * 60_000) continue;
      const time = timeFmt.format(start);
      slots.push({ start, time, label: `${dowFmt.format(start)} ${time}` });
    }
    if (slots.length === 0) continue;
    out.push({
      key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      label: dayFmt.format(slots[0].start),
      dow: dowFmt.format(slots[0].start),
      date: dateFmt.format(slots[0].start),
      slots,
    });
  }
  return out;
}

export function nextSlot(nowMs: number, sch: Schedule): Slot | null {
  return openDays(nowMs, sch, 1)[0]?.slots[0] ?? null;
}

/** "Mon–Sat · 7 AM–6 PM" — the schedule, formatted. Data, not copy: Intl
    writes every word. A non-contiguous day set lists its days. */
export function hoursLine(sch: Schedule): string {
  const ref = (dow: number) => Date.UTC(2026, 0, 4 + dow, 17); // 2026-01-04 is a Sunday
  const dow = fmt("UTC", "dowU", { weekday: "short" });
  const days = [...sch.days].filter((d) => d !== 0).sort((a, b) => a - b);
  const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayPart =
    run && days.length > 1 ? `${dow.format(ref(days[0]))}–${dow.format(ref(days[days.length - 1]))}` : days.map((d) => dow.format(ref(d))).join(", ");
  const hr = fmt("UTC", "hrU", { hour: "numeric" });
  const at = (h: number) => hr.format(Date.UTC(2026, 0, 5, h));
  return `${dayPart} · ${at(sch.open)}–${at(sch.close)}`;
}

/** The typical reply, in minutes, from STORED thread timestamps: every gap
    between a customer message and the business message that answers it,
    median, rounded. Nothing hand-typed. */
export function typicalReply(thread: { from: string; time: string }[]): number | null {
  const mins = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!m) return NaN;
    return ((+m[1] % 12) + (/p/i.test(m[3]) ? 12 : 0)) * 60 + +m[2];
  };
  const gaps: number[] = [];
  for (let i = 0; i + 1 < thread.length; i++) {
    if (thread[i].from === "customer" && thread[i + 1].from === "business") {
      const g = mins(thread[i + 1].time) - mins(thread[i].time);
      if (Number.isFinite(g) && g >= 0) gaps.push(g);
    }
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2);
}

/* ---------- real functions: tel, sms, ics, vcf --------------------------- */

export const isIOS = (ua: string) =>
  /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\//i.test(ua));

/** Facebook, Instagram and Messenger in-app browsers: no .ics handler and
    no contact import, so the calendar opens Google's template URL and Save
    shows the number with a Copy button instead. */
export const isInApp = (ua: string) => /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Instagram|Messenger/i.test(ua);

/** iOS reads the body after "&", everything else after "?". */
export function smsHref(base: string, body: string, ios: boolean): string {
  return `${base}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/** "+18044953492" from "tel:+18044953492". */
export const telNumber = (href: string) => href.replace(/^tel:/, "");

/** (804) 495-3492 */
export function prettyPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length !== 10) return digits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Live format as typed: "804" -> "(804", "8045550" -> "(804) 555-0". */
export function formatTyping(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export const phoneDigits = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length === 11 && d[0] === "1" ? d.slice(1) : d;
};

const icsStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 TEXT escaping. */
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** RFC 5545 line folding at 75 octets (UTF-8 aware). */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export type Booking = { job: string; slot: Slot; name: string; phone: string };

export function buildIcs(biz: string, b: Booking, nowMs: number, slotMinutes: number): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Salvage//go//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.slot.start}-${phoneDigits(b.phone) || "0"}@salvage.davyjoneslocker.app`,
    `DTSTAMP:${icsStamp(nowMs)}`,
    `DTSTART:${icsStamp(b.slot.start)}`,
    `DTEND:${icsStamp(b.slot.start + slotMinutes * 60_000)}`,
    `SUMMARY:${icsText(`${b.job} · ${biz}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** vCard 3.0 TEXT escaping. */
const vcfText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

export function buildVcf(biz: string, tel: string): string {
  return (
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${vcfText(biz)}`,
      `ORG:${vcfText(biz)}`,
      `TEL;TYPE=WORK,VOICE:${tel}`,
      "END:VCARD",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}

const gcalStamp = icsStamp;

export function googleCalendarUrl(biz: string, b: Booking, sch: Schedule): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.job} · ${biz}`,
    dates: `${gcalStamp(b.slot.start)}/${gcalStamp(b.slot.start + sch.slotMinutes * 60_000)}`,
    ctz: sch.tz,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** A filesystem-safe stem for the downloads. */
export const fileStem = (biz: string) =>
  biz.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "booking";
