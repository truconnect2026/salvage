"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import {
  buildIcs,
  buildVcf,
  fileStem,
  fill,
  formatTyping,
  googleCalendarUrl,
  nextSlot,
  openDays,
  phoneDigits,
  smsHref,
  telNumber,
  type Booking,
  type Slot,
  type SlotDay,
} from "@/lib/go";
import { track } from "@/lib/track";

/*
 * change 42: the /go card. Identity on top, big action slots, one primary
 * CTA (the Captain's Card structure — not its styling). The server renders
 * all of it; JS adds the booking sheet and the downloads. The entrance is
 * CSS, so nothing waits at opacity 0 for hydration.
 *
 * Accent discipline: the trade accent paints ONLY the primary slot, the
 * status dot and the trade label. Teal is focus and interactivity; gold is
 * the confirm CTA and the owner's money line.
 */

export type GoCopy = {
  open: string; closed: string; book: string; nextLabel: string;
  text: string; call: string; emergency: string; quote: string; save: string;
  smsBody: string; stepJob: string; stepTime: string; stepYou: string;
  namePh: string; phonePh: string; nameErr: string; phoneErr: string;
  confirm: string; sendQuote: string; back: string; close: string;
  doneTitle: string; doneSub: string; quoteDoneTitle: string; quoteDoneSub: string;
  addCal: string; copyNumber: string; copied: string; ownerSide: string;
  demoNote: string; poweredBy: string;
  recoveredLabel: string;
  notify: { bookedLabel: string; appTag: string; nowLabel: string };
};

type Props = {
  biz: string;
  /** The server-rendered, measured <h1> (app/go/FitName.tsx). */
  nameSlot: ReactNode;
  presetId: string;
  trade: string;
  jobs: readonly string[];
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
  open: boolean;
  nextLabel: string;
  copy: GoCopy;
};

type Mode = null | "book" | "quote" | "save";
type BookStep = "job" | "time" | "you" | "done";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/* ---------- glyphs: hand-drawn, 24px box, the demo's stroke weight ------- */

function Glyph({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const G = {
  calendar: (
    <Glyph>
      <rect x="3.5" y="5" width="17" height="15.5" rx="0.75" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <rect x="13.5" y="13" width="3.5" height="3.5" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  text: (
    <Glyph>
      <path d="M3.5 5h17v11h-9.5l-4.5 3.8V16h-3z" />
      <path d="M7.5 9.2h9M7.5 12.2h5.5" />
    </Glyph>
  ),
  call: (
    <Glyph>
      <path d="M7 3.6l2.5-.4 1.5 4.1-1.9 1.4a10.6 10.6 0 0 0 4.7 4.7l1.4-1.9 4.1 1.5-.4 2.5a2 2 0 0 1-2.1 1.7C11 16.8 6.2 12 5.3 5.7A2 2 0 0 1 7 3.6z" />
    </Glyph>
  ),
  emergency: (
    <Glyph>
      <path d="M6 5.6l2.5-.4 1.5 4.1-1.9 1.4a10.6 10.6 0 0 0 4.7 4.7l1.4-1.9 4.1 1.5-.4 2.5a2 2 0 0 1-2.1 1.7C10 18.8 5.2 14 4.3 7.7A2 2 0 0 1 6 5.6z" />
      <path d="M14.5 3.5a5.5 5.5 0 0 1 5 5" />
      <path d="M14.2 6.4a2.8 2.8 0 0 1 2.4 2.4" />
    </Glyph>
  ),
  camera: (
    <Glyph>
      <path d="M3 8.2h4.2l1.6-2.7h6.4l1.6 2.7H21V19H3z" />
      <circle cx="12" cy="13.4" r="3.3" />
      <path d="M17.8 10.6h.01" />
    </Glyph>
  ),
  save: (
    <Glyph>
      <rect x="3.5" y="4.5" width="17" height="15" rx="0.75" />
      <circle cx="9" cy="10.4" r="2.1" />
      <path d="M5.9 16.4c.6-1.7 1.7-2.5 3.1-2.5s2.5.8 3.1 2.5M14.5 9.6h3.5M14.5 12.6h3.5" />
    </Glyph>
  ),
  chevron: (
    <Glyph size={20}>
      <path d="M9.5 6.5l5.5 5.5-5.5 5.5" />
    </Glyph>
  ),
  back: (
    <Glyph size={20}>
      <path d="M14.5 6.5L9 12l5.5 5.5" />
    </Glyph>
  ),
  close: (
    <Glyph size={20}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Glyph>
  ),
};

/* The drawn check: a ring, then the tick, each stroked on by CSS. */
function DrawnCheck() {
  return (
    <svg data-go-check width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="text-teal">
      <circle className="go-draw go-draw-ring" cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="1.5" pathLength={1} />
      <path className="go-draw go-draw-tick" d="M17.5 28.8l7 7 14-15.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
    </svg>
  );
}

const noSubscribe = () => () => {};

/* ---------- downloads ---------------------------------------------------- */

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
  const { biz, copy, accent, accentInk, demo } = props;
  /* The next-open sub-line: the server's request-clock value through
     hydration, then the visitor's own clock. */
  const next = useSyncExternalStore(
    noSubscribe,
    () => nextSlot(Date.now())?.label ?? "",
    () => props.nextLabel,
  );
  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState<BookStep>("job");
  const [days, setDays] = useState<SlotDay[]>([]);
  const [job, setJob] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tried, setTried] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [quoteDone, setQuoteDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const modeRef = useRef<Mode>(null);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sms = smsHref(props.smsBase, fill(copy.smsBody, biz), props.ios);
  const ping = useCallback(
    (action: string) => track("go_action", { action, preset: props.presetId, ref: props.refId, lead: props.lead }),
    [props.presetId, props.refId, props.lead],
  );

  /* ---- sheet: open / close, history, focus ---- */

  const openSheet = (m: Exclude<Mode, null>, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    if (m === "book") {
      setDays(openDays(Date.now()));
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
    ping(m);
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
     gutter is reserved in CSS so nothing shifts sideways either. */
  useEffect(() => {
    const root = document.documentElement;
    if (mode) root.setAttribute("data-go-locked", "");
    else root.removeAttribute("data-go-locked");
    if (!mode && triggerRef.current) {
      triggerRef.current.focus({ preventScroll: true });
      triggerRef.current = null;
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
    setBooking({ job, slot, name: name.trim(), phone });
    setStep("done");
    ping("booked");
  };
  const back = () => setStep(step === "you" ? "time" : "job");

  const saveContact = (e: React.MouseEvent<HTMLElement>) => {
    if (props.inApp) {
      if (mode) setMode("save");
      else openSheet("save", e.currentTarget);
      return;
    }
    download(`${fileStem(biz)}.vcf`, "text/vcard;charset=utf-8", buildVcf(biz, telNumber(props.tel)));
    ping("save");
  };
  const addCalendar = () => {
    if (!booking) return;
    download(`${fileStem(biz)}.ics`, "text/calendar;charset=utf-8", buildIcs(biz, booking, Date.now()));
    ping("calendar");
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

  const open = mode !== null;
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

  return (
    <div
      data-go-root
      data-preset={props.presetId}
      style={{ ["--accent" as string]: accent, ["--accent-ink" as string]: accentInk }}
    >
      <main data-go inert={open} className="go-col">
        {/* 1. Identity */}
        <header data-go-identity className="go-in" style={{ ["--i" as string]: 0 }}>
          {props.nameSlot}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {props.trade && (
              <span data-go-trade className="font-figures text-[12px] uppercase tracking-[0.14em] text-[var(--accent)]">
                {props.trade}
              </span>
            )}
            <span data-go-status data-open={props.open ? "1" : "0"} className="go-pill">
              <span aria-hidden="true" className="go-dot" />
              {props.open ? copy.open : copy.closed}
            </span>
          </div>
        </header>

        <div data-go-slots className="mt-7 flex flex-col gap-2.5">
          {/* 2. Emergency — home only, top of the stack */}
          {props.emergency && (
            <a
              data-go-slot="emergency"
              href={props.tel}
              onClick={() => ping("emergency")}
              className="go-slot go-slot-row go-in go-emergency"
              style={{ ["--i" as string]: 1 }}
            >
              <span className="go-glyph text-ember">{G.emergency}</span>
              <span className="text-[16px] font-medium">{copy.emergency}</span>
              <span data-figure="data" className="ml-auto text-[13px] text-muted">
                {props.telPretty}
              </span>
            </a>
          )}

          {/* 3. Primary — the one CTA, in the trade accent */}
          <button
            type="button"
            data-go-slot="book"
            onClick={(e) => openSheet("book", e.currentTarget)}
            className="go-slot go-slot-row go-in go-primary"
            style={{ ["--i" as string]: 2 }}
            aria-haspopup="dialog"
          >
            <span className="go-glyph">{G.calendar}</span>
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="text-[18px] font-medium leading-tight">{copy.book}</span>
              {next && (
                <span data-go-next data-figure="data" className="mt-1 text-[13px] leading-none opacity-75">
                  {copy.nextLabel} · {next}
                </span>
              )}
            </span>
            <span className="ml-auto opacity-70">{G.chevron}</span>
          </button>

          {/* 4. The 2x2 */}
          <div className="grid grid-cols-2 gap-2.5">
            <a
              data-go-slot="text"
              href={sms}
              onClick={() => ping("text")}
              className="go-slot go-tile go-in"
              style={{ ["--i" as string]: 3 }}
            >
              <span className="go-glyph text-teal">{G.text}</span>
              <span>{copy.text}</span>
            </a>
            <a
              data-go-slot="call"
              href={props.tel}
              onClick={() => ping("call")}
              className="go-slot go-tile go-in"
              style={{ ["--i" as string]: 4 }}
            >
              <span className="go-glyph text-teal">{G.call}</span>
              <span>{copy.call}</span>
            </a>
            <button
              type="button"
              data-go-slot="quote"
              onClick={(e) => openSheet("quote", e.currentTarget)}
              className="go-slot go-tile go-in"
              style={{ ["--i" as string]: 5 }}
              aria-haspopup="dialog"
            >
              <span className="go-glyph text-teal">{G.camera}</span>
              <span>{copy.quote}</span>
            </button>
            <button
              type="button"
              data-go-slot="save"
              onClick={saveContact}
              className="go-slot go-tile go-in"
              style={{ ["--i" as string]: 6 }}
            >
              <span className="go-glyph text-teal">{G.save}</span>
              <span>{copy.save}</span>
            </button>
          </div>
        </div>

        {/* 5. Folio */}
        <footer data-go-folio className="go-in mt-8 border-t border-line pt-3" style={{ ["--i" as string]: 7 }}>
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-teal">
              <span className="font-display text-[11px] font-semibold leading-none text-abyss">S</span>
            </span>
            {copy.poweredBy}
          </p>
          {demo && (
            <p data-go-demo-note className="mt-1.5 font-caption text-[12px] italic text-muted">
              {copy.demoNote}
            </p>
          )}
        </footer>
      </main>

      {/* The sheet. One transform owner: [data-go-panel]. The backdrop only
          fades. Closed, it is invisible and out of the tab order. */}
      <div data-go-sheet={open ? "open" : "closed"} className="go-sheet" aria-hidden={!open}>
        <div className="go-backdrop" onClick={closeSheet} />
        <div
          ref={panelRef}
          data-go-panel
          role="dialog"
          aria-modal="true"
          aria-labelledby="go-sheet-title"
          className="go-panel"
        >
          <div className="go-panel-inner">
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted/30" />
            <div className="flex min-h-11 items-center gap-2">
              {showBack ? (
                <button type="button" data-go-back onClick={back} className="go-icon-btn -ml-2 pr-2">
                  {G.back}
                  <span className="text-[14px]">{copy.back}</span>
                </button>
              ) : null}
              {mode === "book" && step !== "done" && (
                <span aria-hidden="true" className="ml-auto flex gap-1">
                  {(["job", "time", "you"] as const).map((s) => (
                    <span key={s} className={`h-0.5 w-4 ${s === step ? "bg-teal" : "bg-line"}`} />
                  ))}
                </span>
              )}
              <button
                type="button"
                data-go-close
                onClick={closeSheet}
                aria-label={copy.close}
                className={`go-icon-btn -mr-2 ${mode === "book" && step !== "done" ? "" : "ml-auto"}`}
              >
                {G.close}
              </button>
            </div>

            {mode === "book" && step === "done" ? null : mode === "quote" && quoteDone ? null : (
              <h2
                id="go-sheet-title"
                ref={headRef}
                tabIndex={-1}
                data-go-step={mode === "book" ? step : mode ?? ""}
                className="mt-1 font-display text-[26px] font-medium leading-tight text-ink outline-none"
              >
                {heading}
              </h2>
            )}

            {/* Step 1: job */}
            {mode === "book" && step === "job" && (
              <ul data-go-jobs className="mt-4 border-t border-line">
                {props.jobs.map((j) => (
                  <li key={j} className="border-b border-line">
                    <button type="button" data-go-job onClick={() => pickJob(j)} className="go-row">
                      <span>{j}</span>
                      <span className="ml-auto text-muted">{G.chevron}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Step 2: time */}
            {mode === "book" && step === "time" && (
              <div data-go-times className="mt-4">
                {firstSlot && (
                  <button
                    type="button"
                    data-go-fast
                    data-start={firstSlot.start}
                    onClick={() => pickSlot(firstSlot)}
                    className="go-slot go-slot-row go-fast w-full"
                  >
                    <span className="text-[16px] font-medium">{copy.nextLabel}</span>
                    <span data-figure="data" className="ml-auto text-[14px]">
                      {firstSlot.label}
                    </span>
                    <span className="text-teal">{G.chevron}</span>
                  </button>
                )}
                {days.map((d) => (
                  <section key={d.key} data-go-day={d.key} className="mt-5">
                    <h3 data-figure="data" className="text-[12px] uppercase tracking-[0.12em] text-muted">
                      {d.label}
                    </h3>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {d.slots.map((s) => (
                        <button
                          key={s.start}
                          type="button"
                          data-go-time
                          data-start={s.start}
                          onClick={() => pickSlot(s)}
                          className="go-chip"
                          aria-label={s.label}
                        >
                          <span data-figure="data">{s.time}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* Step 3: you */}
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
                  <p className="text-[14px] text-muted">
                    {job} · <span data-figure="data">{slot.label}</span>
                  </p>
                )}
                <div>
                  <input
                    data-go-field="name"
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder={copy.namePh}
                    aria-label={copy.namePh}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={tried && !nameOk}
                    aria-describedby="go-name-err"
                    className="go-input"
                  />
                  {tried && !nameOk && (
                    <p id="go-name-err" data-go-err="name" className="mt-1.5 text-[13px] text-ember">
                      {copy.nameErr}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    data-go-field="phone"
                    type="tel"
                    name="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder={copy.phonePh}
                    aria-label={copy.phonePh}
                    value={phone}
                    onChange={(e) => setPhone(formatTyping(e.target.value))}
                    aria-invalid={tried && !phoneOk}
                    aria-describedby="go-phone-err"
                    className="go-input"
                    data-figure="data"
                  />
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

            {/* Done */}
            {mode === "book" && step === "done" && booking && (
              <div data-go-done className="pb-1">
                <DrawnCheck />
                <h2
                  id="go-sheet-title"
                  ref={headRef}
                  tabIndex={-1}
                  data-go-step="done"
                  className="mt-3 font-display text-[30px] font-medium leading-tight text-ink outline-none"
                >
                  {copy.doneTitle}
                </h2>
                <p className="mt-1 text-[15px] text-muted">{fill(copy.doneSub, biz)}</p>
                <div data-go-summary className="mt-4 border-y border-line py-3">
                  <p className="text-[16px] text-ink">{booking.job}</p>
                  <p data-figure="data" className="mt-0.5 text-[14px] text-muted">
                    {booking.slot.label}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {props.inApp ? (
                    <a
                      data-go-cal
                      href={googleCalendarUrl(biz, booking)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => ping("calendar")}
                      className="go-slot go-tile go-tile-sm"
                    >
                      <span className="go-glyph text-teal">{G.calendar}</span>
                      <span>{copy.addCal}</span>
                    </a>
                  ) : (
                    <button type="button" data-go-cal onClick={addCalendar} className="go-slot go-tile go-tile-sm">
                      <span className="go-glyph text-teal">{G.calendar}</span>
                      <span>{copy.addCal}</span>
                    </button>
                  )}
                  <button type="button" data-go-save onClick={saveContact} className="go-slot go-tile go-tile-sm">
                    <span className="go-glyph text-teal">{G.save}</span>
                    <span>{copy.save}</span>
                  </button>
                </div>
                {demo && <OwnerPhone copy={copy} booking={booking} ticket={props.ticket} />}
              </div>
            )}

            {/* Quote */}
            {mode === "quote" && !quoteDone && (
              <div data-go-quote className="mt-4">
                <label className="go-pick">
                  <input
                    data-go-photo
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onPhoto}
                    className="sr-only"
                  />
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img data-go-thumb src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-teal">
                      <Glyph size={40}>
                        <path d="M3 8.2h4.2l1.6-2.7h6.4l1.6 2.7H21V19H3z" />
                        <circle cx="12" cy="13.4" r="3.3" />
                        <path d="M17.8 10.6h.01" />
                      </Glyph>
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
                    ping("quote_sent");
                  }}
                  className="go-cta mt-3"
                >
                  {copy.sendQuote}
                </button>
              </div>
            )}
            {mode === "quote" && quoteDone && (
              <div data-go-quote-done className="pb-1">
                <DrawnCheck />
                <h2
                  id="go-sheet-title"
                  ref={headRef}
                  tabIndex={-1}
                  data-go-step="quote-done"
                  className="mt-3 font-display text-[30px] font-medium leading-tight text-ink outline-none"
                >
                  {copy.quoteDoneTitle}
                </h2>
                <p className="mt-1 text-[15px] text-muted">{fill(copy.quoteDoneSub, biz)}</p>
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="mt-4 h-20 w-20 border border-line object-cover" />
                )}
              </div>
            )}

            {/* Save, in-app browsers: the number and a Copy button */}
            {mode === "save" && (
              <div data-go-save-panel className="mt-4">
                <input
                  id="go-copy-field"
                  readOnly
                  value={props.telPretty}
                  aria-label={copy.save}
                  data-figure="data"
                  className="go-input text-[22px]"
                />
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

/* The owner's side, demo mode only: a lock screen, the Salvage entry
   sliding in with the demo's ruled notify look, and the stored ticket
   inking in gold beneath it. */
function OwnerPhone({ copy, booking, ticket }: { copy: GoCopy; booking: Booking; ticket: number }) {
  const [clock] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, ""),
  );
  return (
    <div data-go-owner className="mt-6">
      <p className="font-caption text-[13px] italic text-muted">{copy.ownerSide}</p>
      <div className="go-mini-phone mt-3 font-phone">
        <div aria-hidden="true" className="mx-auto h-1.5 w-14 rounded-full bg-line" />
        <p data-figure="hero" className="mt-3 text-center text-[40px] leading-none text-ink">
          {clock}
        </p>
        <div data-go-notify className="go-notify mt-4">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-teal">
              <span className="font-display text-[13px] font-semibold leading-none text-abyss">S</span>
            </span>
            <span className="text-[11px] font-medium text-muted">{copy.notify.appTag}</span>
            <span className="ml-auto text-[11px] text-muted">{copy.notify.nowLabel}</span>
          </div>
          <p className="mt-1.5 text-[15px] font-medium leading-snug text-ink">
            {copy.notify.bookedLabel} · {booking.name}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {booking.job} · {booking.slot.label}
          </p>
        </div>
        <div data-go-ledger className="go-ledger mt-3">
          <span className="text-[12px] text-muted">{copy.recoveredLabel}</span>
          <span data-go-ticket data-figure="hero" className="ml-auto text-[24px] leading-none text-gold">
            +{usd(ticket)}
          </span>
        </div>
      </div>
    </div>
  );
}
