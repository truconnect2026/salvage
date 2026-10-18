/**
 * change 42: the /go customer page's pure logic. No React, no DOM, no demo
 * engine, no config — app/go/page.tsx (server) and app/go/GoCard.tsx
 * (client) both import it, so the server's first paint and the client's
 * later reads resolve the same slots.
 *
 * Every clock read is America/New_York and DST-correct: wall times are
 * turned into instants with the zone's offset AT THAT INSTANT, never the
 * offset of "now" (gate 209 freezes the clock on 2026-11-01 01:30 ET, the
 * fall-back hour, to hold this).
 */
/* No config import: this module ships in the client bundle, and the copy
   travels as props from the server (lib/go-params.ts) instead. */
export const TZ = "America/New_York";

/* Open Mon-Sat 07:00-18:00 ET. Four bookable starts a day, all inside it. */
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 18;
export const SLOT_STARTS: [number, number][] = [
  [8, 0],
  [10, 0],
  [13, 0],
  [15, 0],
];
export const SLOT_MINUTES = 60;
/* A slot must start at least this far out to be offered — "never a past
   slot" includes the one that starts while the customer is still typing. */
export const LEAD_MINUTES = 60;
export const OPEN_DAYS = 3;

export const fill = (s: string, biz: string) => s.replace(/\{biz\}/g, biz);

/* ---------- clock: America/New_York ------------------------------------- */

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
});

export type EtParts = { y: number; m: number; d: number; h: number; min: number; s: number; dow: number };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function etParts(ms: number): EtParts {
  const parts = partsFmt.formatToParts(new Date(ms));
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

/** The zone's offset (ms, local minus UTC) at instant `ms`. */
function offsetAt(ms: number): number {
  const p = etParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/** The instant an ET wall time names. Two passes settle the offset across a
    transition; a wall time inside the spring-forward gap lands an hour late,
    the fall-back hour resolves to its first (EDT) occurrence. No slot start
    sits in either hour. */
export function etToUtc(y: number, m: number, d: number, h: number, min: number): number {
  const wall = Date.UTC(y, m - 1, d, h, min);
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return t;
}

export function isOpenAt(ms: number): boolean {
  const p = etParts(ms);
  if (p.dow === 0) return false;
  const mins = p.h * 60 + p.min;
  return mins >= OPEN_HOUR * 60 && mins < CLOSE_HOUR * 60;
}

export type Slot = { start: number; label: string; time: string };
export type SlotDay = { key: string; label: string; slots: Slot[] };

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const dowFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });

/** The next OPEN_DAYS days with at least one bookable start, ET, Sundays
    skipped, past and inside-the-lead starts dropped. */
export function openDays(nowMs: number, days = OPEN_DAYS): SlotDay[] {
  const today = etParts(nowMs);
  const out: SlotDay[] = [];
  for (let i = 0; out.length < days && i < 14; i++) {
    /* Calendar arithmetic on a bare date — no zone, so no offset can move
       the day. */
    const cal = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    if (cal.getUTCDay() === 0) continue;
    const y = cal.getUTCFullYear();
    const m = cal.getUTCMonth() + 1;
    const d = cal.getUTCDate();
    const slots: Slot[] = [];
    for (const [h, min] of SLOT_STARTS) {
      const start = etToUtc(y, m, d, h, min);
      if (start < nowMs + LEAD_MINUTES * 60_000) continue;
      const time = timeFmt.format(start);
      slots.push({ start, time, label: `${dowFmt.format(start)} ${time}` });
    }
    if (slots.length === 0) continue;
    out.push({ key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, label: dayFmt.format(slots[0].start), slots });
  }
  return out;
}

export function nextSlot(nowMs: number): Slot | null {
  return openDays(nowMs, 1)[0]?.slots[0] ?? null;
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

export function buildIcs(biz: string, b: Booking, nowMs: number): string {
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
    `DTEND:${icsStamp(b.slot.start + SLOT_MINUTES * 60_000)}`,
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

export function googleCalendarUrl(biz: string, b: Booking): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.job} · ${biz}`,
    dates: `${gcalStamp(b.slot.start)}/${gcalStamp(b.slot.start + SLOT_MINUTES * 60_000)}`,
    ctz: TZ,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** A filesystem-safe stem for the downloads. */
export const fileStem = (biz: string) =>
  biz.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "booking";
