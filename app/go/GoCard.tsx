"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import {
  buildIcs,
  buildVcf,
  fileStem,
  fill,
  formatTyping,
  googleCalendarUrl,
  isOpenAt,
  minuteOfDay,
  nextSlot,
  openDays,
  openToday,
  phoneDigits,
  smsHref,
  telNumber,
  type Booking,
  type Schedule,
  type Slot,
  type SlotDay,
} from "@/lib/go";
import { track } from "@/lib/track";

import { CompassRose, Glyph, jobGlyph, SLOT } from "./glyphs";

/*
 * change 45: the door, rebuilt. Identity on top with a STATUS INSTRUMENT
 * (a drawn 24h dial: the open window as the accent arc, a hand at the
 * current time), the emergency band — the page's ONE filled surface — then
 * 72px slots, the demo's owner phone pinned under them, and a proof row of
 * config data under a drawn compass rose.
 *
 * Accent discipline (DESIGN.md §4): the trade accent paints the dial's
 * open arc, the emergency band, and a slot's left rule while it is
 * pressed. Teal is controls only (focus, the step rail, the chosen day).
 * Gold is the owner card's booked ticket — money gained.
 *
 * The server renders all of it; JS adds the sheet, the downloads, the
 * minute clock and the typed done line. The entrance is CSS, so nothing
 * waits at opacity 0 for hydration.
 */

export type GoCopy = {
  open: string; closed: string; book: string; nextLabel: string;
  text: string; call: string; emergency: string; quote: string; save: string;
  smsBody: string; stepJob: string; stepTime: string; stepYou: string;
  namePh: string; phonePh: string; nameErr: string; phoneErr: string;
  confirm: string; sendQuote: string; back: string; close: string;
  doneTitle: string; doneSub: string; quoteDoneTitle: string; quoteDoneSub: string;
  addCal: string; copyNumber: string; copied: string; ownerSide: string;
  demoNote: string; poweredBy: string; installHint: string;
  recoveredLabel: string;
  /** The Salvage mark's letter — COPY.productName's first. */
  mark: string;
  notify: { bookedLabel: string; appTag: string; nowLabel: string };
};

export type GoJob = { label: string; glyph: string };
export type GoProof = { radius: string; hoursLabel: string; hours: string; reply: string | null };

type Props = {
  biz: string;
  /** The server-rendered, measured <h1> (app/go/FitName.tsx). */
  nameSlot: ReactNode;
  presetId: string;
  trade: string;
  jobs: GoJob[];
  emergency: boolean;
  demo: boolean;
  refId: string;
  lead: string;
  accent: string;
  accentInk: string;
  /** The preset's STORED ticket — never derived (CLAUDE.md data note). */
  ticket: number;
  tel: string;
  telPretty: string;
  smsBase: string;
  ios: boolean;
  inApp: boolean;
  /** iOS Safari, from the request's UA — the Add to Home Screen hint. */
  installHint: boolean;
  schedule: Schedule;
  serverNow: number;
  /** Demo mode only (change 45.1); null on a live door. */
  proof: GoProof | null;
  /** Demo mode's standing owner card: a stored caller and job. */
  sample: { name: string; job: string } | null;
  copy: GoCopy;
};

type Mode = null | "book" | "quote" | "save";
type BookStep = "job" | "time" | "you" | "done";
type OwnerCard = { id: number; name: string; job: string; when: string; fresh: boolean };

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/* ---------- the page's one clock: minute boundaries ---------------------
   Status, dial hand and the next-open line re-check on it. A timer, not a
   frame loop — the page's ONE rAF loop is the typed done line. */
let clockNow = 0;
let clockTimer: ReturnType<typeof setTimeout> | null = null;
const clockSubs = new Set<() => void>();
function armClock() {
  clockTimer = setTimeout(() => {
    clockNow = Date.now();
    clockSubs.forEach((f) => f());
    armClock();
  }, 60_000 - (Date.now() % 60_000) + 25);
}
/* A phone woken from sleep must not show the status it went to sleep with
   until the next minute boundary: resume re-reads the clock at once. */
function onResume() {
  if (document.visibilityState !== "visible") return;
  clockNow = Date.now();
  clockSubs.forEach((f) => f());
  if (clockTimer) clearTimeout(clockTimer);
  armClock();
}
function subscribeClock(cb: () => void) {
  clockSubs.add(cb);
  if (!clockTimer) {
    armClock();
    document.addEventListener("visibilitychange", onResume);
    addEventListener("pageshow", onResume);
  }
  return () => {
    clockSubs.delete(cb);
    if (!clockSubs.size && clockTimer) {
      clearTimeout(clockTimer);
      clockTimer = null;
      document.removeEventListener("visibilitychange", onResume);
      removeEventListener("pageshow", onResume);
    }
  };
}
function useNow(serverNow: number) {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow || (clockNow = Date.now()),
    () => serverNow,
  );
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Types `text` in, one character per 22ms, on the page's ONE rAF loop.
   Reduced motion: the whole line, at once. */
function useTyped(text: string, run: boolean, delayMs = 0) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (reduced()) {
      setN(text.length);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const k = Math.max(0, Math.floor((ts - t0 - delayMs) / 22));
      setN(Math.min(text.length, k));
      if (k < text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, run, delayMs]);
  return text.slice(0, n);
}

/* ---------- the status instrument: a 24h dial ---------------------------
   Noon at the top, midnight at the foot — the day's arc rides over the
   crown like the sun's. The open window is the accent arc on an open day
   and a muted hairline on a closed one (the usual hours, not today's);
   the hand is the zone's current minute. */
const DIAL = 64;
const DC = DIAL / 2;
const DR = 26;
const angleAt = (hours: number) => ((hours - 12) / 24) * 2 * Math.PI;
const onDial = (hours: number, r: number) => [DC + r * Math.sin(angleAt(hours)), DC - r * Math.cos(angleAt(hours))];
const f2 = (n: number) => Math.round(n * 100) / 100;

function Dial({ schedule, now }: { schedule: Schedule; now: number }) {
  const open = isOpenAt(now, schedule);
  const day = openToday(now, schedule);
  const minute = minuteOfDay(now, schedule.tz);
  const [ax, ay] = onDial(schedule.open, DR);
  const [bx, by] = onDial(schedule.close, DR);
  const large = schedule.close - schedule.open > 12 ? 1 : 0;
  const [hx, hy] = onDial(minute / 60, DR - 7);
  return (
    <svg
      data-go-dial
      data-open={open ? "1" : "0"}
      data-from={schedule.open}
      data-to={schedule.close}
      data-minute={minute}
      width={DIAL}
      height={DIAL}
      viewBox={`0 0 ${DIAL} ${DIAL}`}
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx={DC} cy={DC} r={DR} stroke="var(--go-rule)" strokeWidth="1" />
      {Array.from({ length: 24 }, (_, h) => {
        const major = h % 6 === 0;
        const [x1, y1] = onDial(h, DR + 2.5);
        const [x2, y2] = onDial(h, DR + (major ? 6 : 4));
        return <line key={h} x1={f2(x1)} y1={f2(y1)} x2={f2(x2)} y2={f2(y2)} stroke="var(--color-muted)" strokeWidth={major ? 1.25 : 0.75} />;
      })}
      <path
        data-go-arc
        d={`M${f2(ax)} ${f2(ay)}A${DR} ${DR} 0 ${large} 1 ${f2(bx)} ${f2(by)}`}
        stroke={day ? "var(--accent)" : "var(--color-muted)"}
        strokeWidth={day ? 4 : 1.5}
        strokeLinecap="butt"
      />
      <line data-go-hand x1={DC} y1={DC} x2={f2(hx)} y2={f2(hy)} stroke="var(--color-ink)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={DC} cy={DC} r="2.5" fill="var(--color-ink)" />
    </svg>
  );
}

/* ---------- small parts -------------------------------------------------- */

function SMark({ mark, size = 18 }: { mark: string; size?: number }) {
  return (
    <span aria-hidden="true" className="go-smark" style={{ width: size, height: size, fontSize: Math.round(size * 0.68) }}>
      {mark}
    </span>
  );
}

/* The drawn check: a ring, then the tick, each stroked on by CSS. */
function DrawnCheck() {
  return (
    <svg data-go-check width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="text-ink">
      <circle className="go-draw go-draw-ring" cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="1.5" pathLength={1} />
      <path className="go-draw go-draw-tick" d="M17.5 28.8l7 7 14-15.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
    </svg>
  );
}

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* ---------- the card ----------------------------------------------------- */

export default function GoCard(props: Props) {
  const { biz, copy, accent, accentInk, demo, schedule } = props;
  const now = useNow(props.serverNow);
  const open = isOpenAt(now, schedule);
  const nextFree = nextSlot(now, schedule);

  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState<BookStep>("job");
  const [days, setDays] = useState<SlotDay[]>([]);
  const [dayKey, setDayKey] = useState("");
  const [job, setJob] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tried, setTried] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [quoteDone, setQuoteDone] = useState(false);
  const [copied, setCopied] = useState(false);
  /* The owner's phone: booked cards land on top; a booking made in the
     sheet waits until the sheet closes, so its landing is seen. */
  const [cards, setCards] = useState<OwnerCard[]>([]);
  const pendingCard = useRef<OwnerCard | null>(null);
  /* change 45.1 (the fold): in demo mode the standing owner card first
     arrives as an iOS banner pinned to the top safe area — 480ms in (CSS,
     from first paint), a 4s hold, then it flies to its docked spot under
     the slots. The banner's transform has ONE owner, the stylesheet: the
     entrance keyframes, then the dock transition; JS only measures and
     writes the --go-dx/--go-dy/--go-ds it travels by. Opening the sheet
     docks it at once. Reduced motion: no banner, docked from the start. */
  const [dock, setDock] = useState<"banner" | "moving" | "done">(demo && props.sample ? "banner" : "done");
  const bannerRef = useRef<HTMLDivElement>(null);
  const sampleRef = useRef<HTMLLIElement>(null);
  const dockNow = useCallback((travel: boolean) => {
    const b = bannerRef.current;
    const d = sampleRef.current;
    if (!travel || !b || !d) {
      setDock("done");
      return;
    }
    const br = b.getBoundingClientRect();
    const dr = d.getBoundingClientRect();
    b.style.setProperty("--go-dx", `${(dr.left - br.left).toFixed(1)}px`);
    b.style.setProperty("--go-dy", `${(dr.top - br.top).toFixed(1)}px`);
    b.style.setProperty("--go-ds", (dr.width / Math.max(1, br.width)).toFixed(4));
    setDock("moving");
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      setDock("done");
    };
    b.addEventListener("transitionend", land, { once: true });
    setTimeout(land, 700);
  }, []);
  useEffect(() => {
    if (dock !== "banner") return;
    if (reduced()) {
      setDock("done");
      return;
    }
    /* The entrance ran from first paint: dock 4s after it landed. */
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? performance.now();
    const t = setTimeout(() => dockNow(true), Math.max(0, fcp + 480 + 4000 - performance.now()));
    return () => clearTimeout(t);
  }, [dock, dockNow]);
  const cardSeq = useRef(1);
  /* Starts booked in this visit leave the offer: the owner's phone never
     shows a slot the page is still selling. */
  const [taken, setTaken] = useState<number[]>([]);
  const offer = useCallback(
    (ms: number) =>
      openDays(ms, schedule)
        .map((d) => ({ ...d, slots: d.slots.filter((s) => !taken.includes(s.start)) }))
        .filter((d) => d.slots.length > 0),
    [schedule, taken],
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const modeRef = useRef<Mode>(null);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sms = smsHref(props.smsBase, fill(copy.smsBody, biz), props.ios);
  const meta = useMemo(() => ({ preset: props.presetId, ref: props.refId, lead: props.lead }), [props.presetId, props.refId, props.lead]);
  const tap = useCallback((slotName: string) => track("go_tap", { ...meta, slot: slotName }), [meta]);
  useEffect(() => {
    track("go_view", { ...meta, mode: demo ? "demo" : "live" });
  }, [meta, demo]);

  /* ---- sheet: open / close, history, focus ---- */

  const openSheet = (m: Exclude<Mode, null>, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    if (dock !== "done") setDock("done");
    if (m === "book") {
      const d = offer(Date.now());
      setDays(d);
      setDayKey(d[0]?.key ?? "");
      setStep("job");
      setJob("");
      setSlot(null);
      setTried(false);
      setBooking(null);
    }
    if (m === "quote") {
      if (photo) URL.revokeObjectURL(photo);
      setPhoto(null);
      setQuoteDone(false);
    }
    setCopied(false);
    setMode(m);
    /* Browser Back closes the sheet: one history entry per open. */
    history.pushState({ ...(history.state ?? {}), goSheet: true }, "");
  };

  const closeSheet = useCallback(() => {
    if (history.state?.goSheet) history.back();
    else setMode(null);
  }, []);

  useEffect(() => {
    /* A reload with the sheet open restores its history state; drop it so
       the next open's Back lands on a closed sheet. Also re-fit the name
       in case hydration replaced the measured node. */
    if (history.state?.goSheet) history.replaceState({ ...history.state, goSheet: false }, "");
    (window as unknown as { __goFit?: () => void }).__goFit?.();
    const onPop = () => {
      if (modeRef.current && !history.state?.goSheet) setMode(null);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  /* Scroll lock without a jump: the document keeps its offset, and the
     gutter is reserved in CSS so nothing shifts sideways either. Closing
     returns focus to the slot that opened the sheet and lands any booking
     made inside it on the owner's phone. */
  useEffect(() => {
    const root = document.documentElement;
    if (mode) root.setAttribute("data-go-locked", "");
    else root.removeAttribute("data-go-locked");
    if (!mode && triggerRef.current) {
      triggerRef.current.focus({ preventScroll: true });
      triggerRef.current = null;
    }
    if (!mode && pendingCard.current) {
      const c = pendingCard.current;
      pendingCard.current = null;
      setCards((cs) => [c, ...cs.map((x) => ({ ...x, fresh: false }))]);
    }
  }, [mode]);

  /* Every step lands focus on its heading — the screen reader hears where
     it is, and the trap below has a known start. */
  useEffect(() => {
    if (mode) headRef.current?.focus({ preventScroll: true });
  }, [mode, step, quoteDone]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = [...panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === headRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, closeSheet]);

  /* ---- booking ---- */

  const pickJob = (j: string) => {
    setJob(j);
    setStep("time");
  };
  const pickSlot = (s: Slot) => {
    setSlot(s);
    setStep("you");
  };
  const nameOk = name.trim().length > 0;
  const phoneOk = phoneDigits(phone).length === 10;
  const confirm = () => {
    setTried(true);
    if (!nameOk || !phoneOk || !slot) return;
    /* A slot that slid inside the lead window while the sheet sat open
       goes back to the picker instead of booking it. */
    if (slot.start < Date.now() + schedule.leadMinutes * 60_000) {
      const d = offer(Date.now());
      setDays(d);
      setDayKey(d[0]?.key ?? "");
      setSlot(null);
      setStep("time");
      return;
    }
    const b = { job, slot, name: name.trim(), phone };
    setBooking(b);
    setStep("done");
    setTaken((t) => [...t, slot.start]);
    track("go_book_done", meta);
    if (demo) pendingCard.current = { id: cardSeq.current++, name: b.name, job: b.job, when: slot.label, fresh: true };
  };
  const back = () => setStep(step === "you" ? "time" : "job");

  const saveContact = (e: React.MouseEvent<HTMLElement>) => {
    if (props.inApp) {
      if (mode) setMode("save");
      else openSheet("save", e.currentTarget);
      return;
    }
    download(`${fileStem(biz)}.vcf`, "text/vcard;charset=utf-8", buildVcf(biz, telNumber(props.tel)));
  };
  const addCalendar = () => {
    if (!booking) return;
    download(`${fileStem(biz)}.ics`, "text/calendar;charset=utf-8", buildIcs(biz, booking, Date.now(), schedule.slotMinutes));
  };
  const copyNumber = async () => {
    const value = props.telPretty;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.getElementById("go-copy-field") as HTMLInputElement | null;
      el?.select();
      try {
        document.execCommand("copy");
      } catch {}
    }
    setCopied(true);
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(f));
  };

  const sheetOpen = mode !== null;
  const heading =
    mode === "save"
      ? copy.save
      : mode === "quote"
        ? quoteDone
          ? copy.quoteDoneTitle
          : copy.quote
        : step === "job"
          ? copy.stepJob
          : step === "time"
            ? copy.stepTime
            : step === "you"
              ? copy.stepYou
              : copy.doneTitle;
  const showBack = mode === "book" && (step === "time" || step === "you");
  const firstSlot = days[0]?.slots[0] ?? null;
  const stepIndex = step === "job" ? 0 : step === "time" ? 1 : 2;
  const typedLine = useTyped(booking ? `${booking.job} · ${booking.slot.label}` : "", mode === "book" && step === "done" && !!booking, 520);

  /* The next-open line skips anything booked in this visit. */
  const next = taken.includes(nextFree?.start ?? -1) ? (offer(now)[0]?.slots[0] ?? null) : nextFree;
  /* The standing sample card names its job and nothing else: a time on it
     would either be invented or be the very slot the page offers. */
  const sampleCard: OwnerCard | null = props.sample ? { id: 0, name: props.sample.name, job: props.sample.job, when: "", fresh: false } : null;
  const ownerCards = sampleCard ? [...cards, sampleCard] : cards;

  return (
    <div
      data-go-root
      data-preset={props.presetId}
      style={{ ["--accent" as string]: accent, ["--accent-ink" as string]: accentInk }}
    >
      <main data-go inert={sheetOpen} className="go-page">
        {/* 1. Identity: the name, the trade, the status instrument */}
        <header data-go-identity className="go-ident go-in" style={{ ["--i" as string]: 0 }}>
          {props.nameSlot}
          <div className="go-dialrow">
            <Dial schedule={schedule} now={now} />
            {props.trade && (
              <p data-go-trade className="go-caption text-muted">
                {props.trade}
              </p>
            )}
          </div>
          <p data-go-status data-open={open ? "1" : "0"} className="go-status">
            {open ? copy.open : copy.closed}
          </p>
        </header>

        <section data-go-actions className="go-actions">
          {/* 2. Emergency: the ONE filled surface on the page */}
          {props.emergency && (
            <a data-go-slot="emergency" href={props.tel} onClick={() => tap("emergency")} className="go-emergency go-in" style={{ ["--i" as string]: 1 }}>
              <span data-go-glyph className="go-glyph go-pulse">
                <Glyph size={32}>{SLOT.emergency}</Glyph>
              </span>
              <span className="flex min-w-0 flex-col">
                <span data-go-label className="go-label">
                  {copy.emergency}
                </span>
                <span data-figure="data" className="go-data20">
                  {props.telPretty}
                </span>
              </span>
            </a>
          )}

          {/* 3. The slots: 72px, a left rule that lights on press */}
          <div data-go-slots className="go-slots">
            <button
              type="button"
              data-go-slot="book"
              onClick={(e) => {
                tap("book");
                openSheet("book", e.currentTarget);
              }}
              className="go-slot go-primary go-in"
              style={{ ["--i" as string]: 2 }}
              aria-haspopup="dialog"
            >
              <span data-go-glyph className="go-glyph">
                <Glyph size={32}>{SLOT.book}</Glyph>
              </span>
              <span className="flex min-w-0 flex-col items-start text-left">
                <span data-go-label className="go-label">
                  {copy.book}
                </span>
                {next && (
                  <>
                    <span className="go-caption mt-1 text-muted">{copy.nextLabel}</span>
                    <span data-go-next data-figure="data" className="go-data20 mt-0.5 text-ink">
                      {next.label}
                    </span>
                  </>
                )}
              </span>
              <span className="go-chev ml-auto">
                <Glyph size={20}>{SLOT.chevron}</Glyph>
              </span>
            </button>

            <div className="go-grid">
              <a data-go-slot="text" href={sms} onClick={() => tap("text")} className="go-slot go-tile go-in" style={{ ["--i" as string]: 3 }}>
                <span data-go-glyph className="go-glyph">
                  <Glyph size={32}>{SLOT.text}</Glyph>
                </span>
                <span data-go-label className="go-label">
                  {copy.text}
                </span>
              </a>
              <a data-go-slot="call" href={props.tel} onClick={() => tap("call")} className="go-slot go-tile go-in" style={{ ["--i" as string]: 4 }}>
                <span data-go-glyph className="go-glyph">
                  <Glyph size={32}>{SLOT.call}</Glyph>
                </span>
                <span data-go-label className="go-label">
                  {copy.call}
                </span>
              </a>
              <button
                type="button"
                data-go-slot="quote"
                onClick={(e) => {
                  tap("quote");
                  openSheet("quote", e.currentTarget);
                }}
                className="go-slot go-tile go-in"
                style={{ ["--i" as string]: 5 }}
                aria-haspopup="dialog"
              >
                <span data-go-glyph className="go-glyph">
                  <Glyph size={32}>{SLOT.quote}</Glyph>
                </span>
                <span data-go-label className="go-label">
                  {copy.quote}
                </span>
              </button>
              <button
                type="button"
                data-go-slot="save"
                onClick={(e) => {
                  tap("save");
                  saveContact(e);
                }}
                className="go-slot go-tile go-in"
                style={{ ["--i" as string]: 6 }}
              >
                <span data-go-glyph className="go-glyph">
                  <Glyph size={32}>{SLOT.save}</Glyph>
                </span>
                <span data-go-label className="go-label">
                  {copy.save}
                </span>
              </button>
            </div>
          </div>

          {/* 4. Demo mode: the owner's phone, pinned under the slots */}
          {demo && (
            <div data-go-owner className="go-owner go-in" style={{ ["--i" as string]: 7 }}>
              <p className="go-caption text-muted">{copy.ownerSide}</p>
              <div className="go-mini-phone font-phone">
                <span aria-hidden="true" className="go-island" />
                <ul data-go-cards className="go-cards">
                  {ownerCards.map((c) => (
                    <li
                      key={c.id}
                      ref={c.id === 0 ? sampleRef : undefined}
                      data-go-notify
                      data-go-sample={c.id === 0 ? dock : undefined}
                      data-fresh={c.fresh ? "1" : undefined}
                      className="go-notify"
                    >
                      <div className="flex items-center gap-1.5">
                        <SMark mark={copy.mark} />
                        <span className="text-[13px] font-medium leading-4 text-muted">{copy.notify.appTag}</span>
                        <span className="ml-auto text-[13px] leading-4 text-muted">{copy.notify.nowLabel}</span>
                      </div>
                      <div className="mt-1.5 flex items-end gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold leading-5 text-ink">
                            {copy.notify.bookedLabel} · {c.name}
                          </p>
                          <p className="truncate text-[13px] leading-4.5 text-muted">
                            {c.when ? `${c.job} · ${c.when}` : c.job}
                          </p>
                        </div>
                        <span data-go-ticket data-figure="data" className="go-data20 shrink-0 text-gold">
                          +{usd(props.ticket)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* 5. Proof: config data only, under the DJL compass rose. Demo mode
            only (change 45.1): a live door has no data of its own yet. */}
        {props.proof && (
        <section data-go-proof className="go-proof go-in" style={{ ["--i" as string]: 8 }}>
          <span className="text-muted">
            <CompassRose />
          </span>
          <div className="go-proof-list">
            <p data-go-radius className="go-body">
              {props.proof.radius}
            </p>
            <p className="flex items-baseline gap-2">
              <span className="go-caption text-muted">{props.proof.hoursLabel}</span>
              <span data-go-hours className="go-body">
                {props.proof.hours}
              </span>
            </p>
            {props.proof.reply && (
              <p data-go-reply className="go-body">
                {props.proof.reply}
              </p>
            )}
          </div>
        </section>
        )}

        {/* 6. Folio */}
        <footer data-go-folio className="go-folio go-in" style={{ ["--i" as string]: 9 }}>
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <SMark mark={copy.mark} size={16} />
            {copy.poweredBy}
          </p>
          {demo && (
            <p data-go-demo-note className="mt-1.5 text-[13px] text-muted">
              {copy.demoNote}
            </p>
          )}
          {props.installHint && <InstallHint text={copy.installHint} />}
        </footer>
      </main>

      {/* change 45.1: the demo's arrival banner — the standing owner card,
          pinned to the top safe area, then flown to its dock. A duplicate
          of the docked card, so it stays out of the accessibility tree. */}
      {props.sample && dock !== "done" && (
        <div ref={bannerRef} data-go-banner data-phase={dock} aria-hidden="true" className="go-banner font-phone">
          <div className="flex items-center gap-1.5">
            <SMark mark={copy.mark} />
            <span className="text-[13px] font-medium leading-4 text-muted">{copy.notify.appTag}</span>
            <span className="ml-auto text-[13px] leading-4 text-muted">{copy.notify.nowLabel}</span>
          </div>
          <div className="mt-1.5 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-5 text-ink">
                {copy.notify.bookedLabel} · {props.sample.name}
              </p>
              <p className="truncate text-[13px] leading-4.5 text-muted">{props.sample.job}</p>
            </div>
            <span data-figure="data" className="go-data20 shrink-0 text-gold">
              +{usd(props.ticket)}
            </span>
          </div>
        </div>
      )}

      {/* The sheet. One transform owner: [data-go-panel]. The backdrop only
          fades. Closed, it is invisible and out of the tab order. */}
      <div data-go-sheet={sheetOpen ? "open" : "closed"} className="go-sheet" aria-hidden={!sheetOpen}>
        <div className="go-backdrop" onClick={closeSheet} />
        <div ref={panelRef} data-go-panel role="dialog" aria-modal="true" aria-labelledby="go-sheet-title" className="go-panel">
          <div className="go-panel-inner">
            <div aria-hidden="true" className="go-grip" />
            <div className="flex min-h-11 items-center gap-2">
              {showBack ? (
                <button type="button" data-go-back onClick={back} className="go-icon-btn -ml-2 pr-2">
                  <Glyph size={20}>{SLOT.back}</Glyph>
                  <span className="text-[16px]">{copy.back}</span>
                </button>
              ) : null}
              {mode === "book" && step !== "done" && (
                <span data-go-steprail aria-hidden="true" className="go-steprail">
                  {[0, 1, 2].map((i) => (
                    <span key={i} data-on={i === stepIndex ? "1" : i < stepIndex ? "done" : undefined} />
                  ))}
                </span>
              )}
              <button type="button" data-go-close onClick={closeSheet} aria-label={copy.close} className="go-icon-btn -mr-2 ml-auto">
                <Glyph size={20}>{SLOT.close}</Glyph>
              </button>
            </div>

            {mode === "book" && step === "done" ? null : mode === "quote" && quoteDone ? null : (
              <h2
                id="go-sheet-title"
                ref={headRef}
                tabIndex={-1}
                data-go-step={mode === "book" ? step : mode ?? ""}
                className="go-headline mt-1 outline-none"
              >
                {heading}
              </h2>
            )}

            {/* Step 1: job — 64px chips, a drawn glyph each */}
            {mode === "book" && step === "job" && (
              <div data-go-jobs className="go-jobgrid">
                {props.jobs.map((j) => {
                  const g = jobGlyph(j.glyph);
                  return (
                    <button key={j.label} type="button" data-go-job data-glyph={j.glyph} onClick={() => pickJob(j.label)} className="go-job">
                      {g && (
                        <span className="go-job-glyph">
                          <Glyph size={24} data-go-job-glyph={j.glyph}>
                            {g}
                          </Glyph>
                        </span>
                      )}
                      <span className="go-job-label">{j.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 2: time — the fast path, a day rail, a 2x2 grid per day */}
            {mode === "book" && step === "time" && (
              <div data-go-times className="mt-4">
                {firstSlot && (
                  <button type="button" data-go-fast data-start={firstSlot.start} onClick={() => pickSlot(firstSlot)} className="go-fast">
                    <span className="flex flex-col items-start">
                      <span className="go-label">{copy.nextLabel}</span>
                      <span data-figure="data" className="go-data20 mt-0.5 text-ink">
                        {firstSlot.label}
                      </span>
                    </span>
                    <span className="go-chev ml-auto">
                      <Glyph size={20}>{SLOT.chevron}</Glyph>
                    </span>
                  </button>
                )}
                {/* The ARIA tabs pattern: one tab stop, arrows move it. */}
                <div
                  role="tablist"
                  className="go-dayrail"
                  onKeyDown={(e) => {
                    const i = days.findIndex((d) => d.key === dayKey);
                    const j =
                      e.key === "ArrowRight" ? (i + 1) % days.length : e.key === "ArrowLeft" ? (i - 1 + days.length) % days.length : e.key === "Home" ? 0 : e.key === "End" ? days.length - 1 : -1;
                    if (j < 0 || !days[j]) return;
                    e.preventDefault();
                    setDayKey(days[j].key);
                    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[j]?.focus();
                  }}
                >
                  {days.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      role="tab"
                      data-go-dayrail={d.key}
                      aria-selected={d.key === dayKey}
                      aria-controls={`go-day-${d.key}`}
                      tabIndex={d.key === dayKey ? 0 : -1}
                      onClick={() => setDayKey(d.key)}
                      className="go-daychip"
                    >
                      <span className="go-caption">{d.dow}</span>
                      <span data-figure="data" className="go-data20">
                        {d.date}
                      </span>
                    </button>
                  ))}
                </div>
                {days.map((d) => (
                  <section key={d.key} id={`go-day-${d.key}`} role="tabpanel" data-go-day={d.key} hidden={d.key !== dayKey} aria-label={d.label}>
                    <div className="go-slotgrid">
                      {d.slots.map((s) => (
                        <button key={s.start} type="button" data-go-time data-start={s.start} onClick={() => pickSlot(s)} className="go-chip" aria-label={s.label}>
                          <span data-figure="data">{s.time}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* Step 3: you — 56px fields, floating labels */}
            {mode === "book" && step === "you" && (
              <form
                data-go-you
                noValidate
                className="mt-4 flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirm();
                }}
              >
                {slot && (
                  <p className="go-body text-muted">
                    {job} · <span data-figure="data">{slot.label}</span>
                  </p>
                )}
                <div>
                  <div className="go-field">
                    <input
                      id="go-name"
                      data-go-field="name"
                      type="text"
                      name="name"
                      autoComplete="name"
                      placeholder=" "
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-invalid={tried && !nameOk}
                      aria-describedby="go-name-err"
                      className="go-input"
                    />
                    <label htmlFor="go-name" className="go-float">
                      {copy.namePh}
                    </label>
                  </div>
                  {tried && !nameOk && (
                    <p id="go-name-err" data-go-err="name" className="mt-1.5 text-[13px] text-ember">
                      {copy.nameErr}
                    </p>
                  )}
                </div>
                <div>
                  <div className="go-field">
                    <input
                      id="go-phone"
                      data-go-field="phone"
                      type="tel"
                      name="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      enterKeyHint="done"
                      placeholder=" "
                      value={phone}
                      onChange={(e) => setPhone(formatTyping(e.target.value))}
                      aria-invalid={tried && !phoneOk}
                      aria-describedby="go-phone-err"
                      className="go-input"
                      data-figure="data"
                    />
                    <label htmlFor="go-phone" className="go-float">
                      {copy.phonePh}
                    </label>
                  </div>
                  {tried && !phoneOk && (
                    <p id="go-phone-err" data-go-err="phone" className="mt-1.5 text-[13px] text-ember">
                      {copy.phoneErr}
                    </p>
                  )}
                </div>
                <button type="submit" data-go-confirm className="go-cta mt-1">
                  {copy.confirm}
                </button>
              </form>
            )}

            {/* Done, LIVE door (change 45.1): nothing is sent anywhere yet, so
                no "booked" — the booked line and the two real ways to send
                it: the page's own Text and Call actions. */}
            {mode === "book" && step === "done" && booking && !demo && (
              <div data-go-done data-go-live-actions className="pb-1">
                <h2 id="go-sheet-title" ref={headRef} tabIndex={-1} data-go-step="done" className="go-headline mt-1 outline-none">
                  {booking.job} · <span data-figure="data">{booking.slot.label}</span>
                </h2>
                <LiveActions copy={copy} sms={sms} tel={props.tel} />
              </div>
            )}

            {/* Done, demo: the check draws, then the booked line types in */}
            {mode === "book" && step === "done" && booking && demo && (
              <div data-go-done className="pb-1">
                <DrawnCheck />
                <h2 id="go-sheet-title" ref={headRef} tabIndex={-1} data-go-step="done" className="go-headline mt-3 outline-none">
                  {copy.doneTitle}
                </h2>
                <p className="go-body mt-1 text-muted">{fill(copy.doneSub, biz)}</p>
                <p data-go-summary aria-label={`${booking.job} · ${booking.slot.label}`} className="go-typed">
                  <span aria-hidden="true">{typedLine}</span>
                  {typedLine.length < `${booking.job} · ${booking.slot.label}`.length && <span aria-hidden="true" className="go-caret" />}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {props.inApp ? (
                    <a data-go-cal href={googleCalendarUrl(biz, booking, schedule)} target="_blank" rel="noopener noreferrer" className="go-slot go-tile go-tile-sm">
                      <span className="go-glyph">
                        <Glyph size={32}>{SLOT.book}</Glyph>
                      </span>
                      <span className="go-label">{copy.addCal}</span>
                    </a>
                  ) : (
                    <button type="button" data-go-cal onClick={addCalendar} className="go-slot go-tile go-tile-sm">
                      <span className="go-glyph">
                        <Glyph size={32}>{SLOT.book}</Glyph>
                      </span>
                      <span className="go-label">{copy.addCal}</span>
                    </button>
                  )}
                  <button type="button" data-go-save onClick={saveContact} className="go-slot go-tile go-tile-sm">
                    <span className="go-glyph">
                      <Glyph size={32}>{SLOT.save}</Glyph>
                    </span>
                    <span className="go-label">{copy.save}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quote */}
            {mode === "quote" && !quoteDone && (
              <div data-go-quote className="mt-4">
                <label className="go-pick">
                  <input data-go-photo type="file" accept="image/*" capture="environment" onChange={onPhoto} className="sr-only" />
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img data-go-thumb src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-ink">
                      <Glyph size={40}>{SLOT.quote}</Glyph>
                    </span>
                  )}
                  <span className="sr-only">{copy.quote}</span>
                </label>
                <button
                  type="button"
                  data-go-send
                  disabled={!photo}
                  onClick={() => {
                    setQuoteDone(true);
                    track("go_quote_done", meta);
                  }}
                  className="go-cta mt-3"
                >
                  {copy.sendQuote}
                </button>
              </div>
            )}
            {mode === "quote" && quoteDone && !demo && (
              <div data-go-quote-done data-go-live-actions className="pb-1">
                <h2 id="go-sheet-title" ref={headRef} tabIndex={-1} data-go-step="quote-done" className="go-headline mt-1 outline-none">
                  {copy.quote}
                </h2>
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="mt-4 h-20 w-20 border border-(--go-rule) object-cover" />
                )}
                <LiveActions copy={copy} sms={sms} tel={props.tel} />
              </div>
            )}
            {mode === "quote" && quoteDone && demo && (
              <div data-go-quote-done className="pb-1">
                <DrawnCheck />
                <h2 id="go-sheet-title" ref={headRef} tabIndex={-1} data-go-step="quote-done" className="go-headline mt-3 outline-none">
                  {copy.quoteDoneTitle}
                </h2>
                <p className="go-body mt-1 text-muted">{fill(copy.quoteDoneSub, biz)}</p>
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="mt-4 h-20 w-20 border border-(--go-rule) object-cover" />
                )}
              </div>
            )}

            {/* Save, in-app browsers: the number and a Copy button */}
            {mode === "save" && (
              <div data-go-save-panel className="mt-4">
                <input id="go-copy-field" readOnly value={props.telPretty} aria-label={copy.save} data-figure="data" className="go-input go-data28" />
                <button type="button" data-go-copy onClick={copyNumber} className="go-cta mt-3">
                  {copied ? copy.copied : copy.copyNumber}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* The live door's two real ways through: the page's own Text us and Call. */
function LiveActions({ copy, sms, tel }: { copy: GoCopy; sms: string; tel: string }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2.5">
      <a data-go-live="text" href={sms} className="go-slot go-tile go-tile-sm">
        <span className="go-glyph">
          <Glyph size={32}>{SLOT.text}</Glyph>
        </span>
        <span className="go-label">{copy.text}</span>
      </a>
      <a data-go-live="call" href={tel} className="go-slot go-tile go-tile-sm">
        <span className="go-glyph">
          <Glyph size={32}>{SLOT.call}</Glyph>
        </span>
        <span className="go-label">{copy.call}</span>
      </a>
    </div>
  );
}

/* iOS Safari, not standalone: one drawn line under the folio. The server
   decides iOS Safari from the UA; standalone is hidden by CSS
   (display-mode) and, for older iOS, by navigator.standalone here. */
function InstallHint({ text }: { text: string }) {
  const standalone = useSyncExternalStore(
    () => () => {},
    () => (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
  if (standalone) return null;
  return (
    <p data-go-install className="go-install">
      <Glyph size={20}>{SLOT.share}</Glyph>
      <span>{text}</span>
    </p>
  );
}
