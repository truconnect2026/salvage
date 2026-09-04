import { Fragment, type CSSProperties } from "react";

import { COPY, type CaughtEntry, type Preset } from "@/lib/client.config";

/* Hand-written status glyphs. No emoji, no icon library. */

function SignalGlyph() {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
      <path d="M0 7.6h2.6V11H0z" />
      <path d="M4.8 5.4h2.6V11H4.8z" />
      <path d="M9.6 2.9h2.6V11H9.6z" />
      <path d="M14.4 0h2.6v11h-2.6z" />
    </svg>
  );
}

function WifiGlyph() {
  /* change 30 (B5): FILLED arcs — annular sectors, no strokes. */
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
      <path d="M8 0C4.9 0 2.1 1.2 0 3.2l1.5 1.6C3.2 3.2 5.5 2.2 8 2.2s4.8 1 6.5 2.6L16 3.2C13.9 1.2 11.1 0 8 0z" />
      <path d="M8 4.4c-2 0-3.8.8-5.1 2.1l1.5 1.6C5.3 7.2 6.6 6.6 8 6.6s2.7.6 3.6 1.5l1.5-1.6C11.8 5.2 10 4.4 8 4.4z" />
      <path d="M8 8.8c-.9 0-1.7.4-2.3 1L8 12l2.3-2.2c-.6-.6-1.4-1-2.3-1z" />
    </svg>
  );
}

export function StatusGlyphs() {
  return (
    <span data-status-cluster className="flex items-center gap-[6px] text-white">
      <span data-glyph="signal" className="flex">
        <SignalGlyph />
      </span>
      <span data-glyph="wifi" className="flex">
        <WifiGlyph />
      </span>
      <BatteryGlyph />
    </span>
  );
}

function BatteryGlyph() {
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true">
      <path
        d="M3.4 0.7h14.9a2.7 2.7 0 0 1 2.7 2.7v5.2a2.7 2.7 0 0 1-2.7 2.7H3.4a2.7 2.7 0 0 1-2.7-2.7V3.4A2.7 2.7 0 0 1 3.4 0.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.55"
      />
      <path
        d="M3.6 2.6h11.1a1.4 1.4 0 0 1 1.4 1.4v4a1.4 1.4 0 0 1-1.4 1.4H3.6a1.4 1.4 0 0 1-1.4-1.4V4a1.4 1.4 0 0 1 1.4-1.4z"
        fill="currentColor"
      />
      <path d="M22.4 4.1c1.3 0.5 1.3 3.3 0 3.8z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/* Missed call: a handset with the inbound arrow that never got answered.
   Exported for reuse in the owner panel's caught-call rows. */
export function MissedCallGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M13.6 11.3l-2.1-1.5a1 1 0 0 0-1.3.2l-.7.9a9.6 9.6 0 0 1-3.4-3.4l.9-.7a1 1 0 0 0 .2-1.3L5.7 3.4a1 1 0 0 0-1.4-.2l-1 .8a1.7 1.7 0 0 0-.5 1.8 13.2 13.2 0 0 0 8.4 8.4 1.7 1.7 0 0 0 1.8-.5l.8-1a1 1 0 0 0-.2-1.4z"
        fill="currentColor"
      />
      <path
        d="M14.9 1.1L10.8 5.2M10.8 2.9V5.2H13.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* change 17 (A1): hand-written glyphs for the six-button in-call grid.
   28px, currentColor, no icon library. Scenery, not controls. */
function CallGridGlyph({ kind }: { kind: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 28 28",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "mute":
      return (
        <svg {...common}>
          <rect x="11" y="4" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
          <path d="M7 13a7 7 0 0 0 14 0" />
          <path d="M14 20v4M10 24h8" />
          <path d="M5 3l18 22" />
        </svg>
      );
    case "keypad":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          {[6, 12, 18, 24].map((y) =>
            [8, 14, 20].map((x) => <circle key={`${x}${y}`} cx={x} cy={y - 2} r="2" />),
          )}
        </svg>
      );
    case "speaker":
      return (
        <svg {...common}>
          <path d="M5 11v6h4l6 5V6l-6 5H5z" fill="currentColor" stroke="none" />
          <path d="M18.5 10.5a5 5 0 0 1 0 7" />
          <path d="M21.5 8a9 9 0 0 1 0 12" />
        </svg>
      );
    case "add call":
      return (
        <svg {...common}>
          <circle cx="11" cy="9.5" r="4" fill="currentColor" stroke="none" />
          <path d="M4 23c0-4 3.2-6 7-6s7 2 7 6" fill="currentColor" stroke="none" />
          <path d="M22 8v8M18 12h8" />
        </svg>
      );
    case "FaceTime":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="14" height="12" rx="3" fill="currentColor" stroke="none" />
          <path d="M17 12.5l8-4.5v12l-8-4.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      /* contacts */
      return (
        <svg {...common}>
          <circle cx="14" cy="10" r="4.5" fill="currentColor" stroke="none" />
          <path d="M5 24c0-5 4-7.5 9-7.5s9 2.5 9 7.5" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

/* Filled hang-up handset for the call screen's End button. */
function HandsetGlyph() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ transform: "rotate(135deg)" }}
    >
      <path
        d="M13.6 11.3l-2.1-1.5a1 1 0 0 0-1.3.2l-.7.9a9.6 9.6 0 0 1-3.4-3.4l.9-.7a1 1 0 0 0 .2-1.3L5.7 3.4a1 1 0 0 0-1.4-.2l-1 .8a1.7 1.7 0 0 0-.5 1.8 13.2 13.2 0 0 0 8.4 8.4 1.7 1.7 0 0 0 1.8-.5l.8-1a1 1 0 0 0-.2-1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();

/**
 * The owner notification card (change 10, A4). Rendered twice — inside the
 * phone screen and, on desktop, on the ledger panel's top edge — both driven
 * by the same rAF phase in Demo.tsx. System stack, not brand faces; the one
 * exception is the Salvage "S" mark, which is the brand speaking inside the
 * device's language.
 */
export function NotifyCard({ bizName, entry }: { bizName: string; entry: CaughtEntry }) {
  /* change 18 (C4): a ruled ENTRY, not a card — 1px rule top and bottom,
     no fill, no radius, no blur. Same content; the Salvage S mark keeps
     teal (a 4px square now: the log stamps, it doesn't bead). */
  return (
    <div className="border-y border-line py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-teal">
          <span className="font-display text-[13px] font-semibold leading-none text-abyss">S</span>
        </span>
        <span className="text-[11px] font-medium text-muted">{COPY.notify.appTag}</span>
        <span className="ml-auto text-[11px] text-muted">{COPY.notify.nowLabel}</span>
      </div>
      {/* change 19 (B4): the entry names the CALLER — the owner reads who
          was caught, not their own shingle. */}
      <div className="mt-1.5 truncate text-[14px] font-medium leading-snug text-ink">
        {entry.name} · {entry.detail} · <span data-figure>${entry.amount}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-snug text-muted">
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          aria-hidden="true"
        >
          <rect x="1" y="2.5" width="12" height="10.5" rx="1.5" />
          <path d="M1 6h12M4.5 1v3M9.5 1v3" />
        </svg>
        <span className="truncate">{COPY.ledger.calendarLine}</span>
      </div>
    </div>
  );
}

/* Typing indicator. Hidden in SSR and under reduced motion; the rAF loop is the
   only thing that ever shows it, by writing inline display. */
function TypingRow({ index, right }: { index: number; right: boolean }) {
  return (
    <div data-typing={index} className={`mt-2 hidden ${right ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex items-center gap-[5px] rounded-[20px] px-3.5 py-3 ${
          right ? "bg-[#34C759]" : "bg-[var(--accent,#1E3A5C)]"
        }`}
      >
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            data-dot={d}
            className={`h-[7px] w-[7px] rounded-full ${right ? "bg-white/60" : "bg-[var(--accent-ink,#8AA0B4)]/60"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* The iOS Messages app mark: green squircle, white speech-bubble path. */
/* change 30 (B2): the iMessage tail — a 6px curved hook at the bottom-outer
   corner of a run's last bubble, drawn in the bubble's own fill. */
function BubbleTail({ side, color }: { side: "left" | "right"; color: string }) {
  return (
    <svg
      aria-hidden="true"
      width="7"
      height="6"
      viewBox="0 0 7 6"
      className={`absolute bottom-0 ${side === "right" ? "-right-[5px]" : "-left-[5px] -scale-x-100"}`}
      style={{ fill: color }}
    >
      <path d="M0 0c0.4 2.6 1.8 4.6 4.4 5.6 0.9 0.35 1.05-0.3 0.4-0.9C2.9 3.1 2 1.7 2 0z" />
    </svg>
  );
}

function MessagesGlyph() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#34C759]">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="white" aria-hidden="true">
        <path d="M8 2C4.13 2 1 4.58 1 7.76c0 1.71.93 3.24 2.38 4.29-.09.77-.46 1.5-1.06 2.08-.12.12-.03.32.14.31 1.16-.03 2.24-.45 3.05-1.02.78.22 1.62.34 2.49.34 3.87 0 7-2.58 7-5.76S11.87 2 8 2z" />
      </svg>
    </span>
  );
}

/**
 * The customer's outgoing call (change 11, step 1). Her phone, her call:
 * bizName large in the upper third, a status line that cycles calling… ->
 * ringing… -> Call Ended, a static avatar with the business's initials, one
 * red End button. No clock — this is the full-screen in-call UI. SSR ships
 * it hidden (the settled thread is the no-JS floor); the rAF engine in
 * Demo.tsx drives every animated piece, including the ellipsis dots and the
 * Messages banner that lands over the dead call.
 */
function CallScreen({ preset, bizName, showBanner }: { preset: Preset; bizName: string; showBanner: boolean }) {
  return (
    <div
      data-call
      className="absolute inset-0 z-30 hidden flex-col items-center overflow-hidden rounded-[44px] font-phone"
      style={{ background: "linear-gradient(180deg, #071021 0%, #0B1830 100%)" }}
    >
      {/* Status glyphs persist — the hardware doesn't vanish during a call. */}
      <div className="absolute right-6 top-2 z-10">
        <StatusGlyphs />
      </div>

      {/* Upper third: who she's calling, and how it's going. change 17
          (A2): flat avatar, system-stack semibold initials, no gradient. */}
      <div className="flex w-full flex-col items-center pt-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft,#162A44)]">
          <span data-avatar-initials className="text-[22px] font-semibold text-[var(--accent,#8AA0B4)]">{initialsOf(bizName)}</span>
        </div>
        <div data-call-biz className="mt-4 text-[26px] font-medium leading-tight text-ink">
          {bizName}
        </div>
        <div data-call-status className="mt-1.5 text-[14px] text-muted">
          <span data-call-status-stem>{COPY.call.callingLabel.replace(/…$/, "")}</span>
          <span data-call-dots>…</span>
        </div>

      </div>

      {/* change 17 (A1): the six-button iOS in-call grid. Scenery — it
          never takes a tap. change 26 (C2): anchored so its bottom row sits
          120px above the End circle; the name block owns the top third. */}
      <div className="absolute inset-x-0 bottom-[238px] flex justify-center">
        <div data-call-grid className="pointer-events-none grid grid-cols-3 gap-x-9 gap-y-5">
          {COPY.call.grid.map((label) => (
            <div key={label} data-call-grid-btn className="flex w-[72px] flex-col items-center gap-1.5">
              <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/20 text-white">
                <CallGridGlyph kind={label} />
              </span>
              <span className="whitespace-nowrap text-[12px] text-white/85">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* The 30% dim that lands when the call dies. */}
      <div
        data-call-dim
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: 0 }}
      />

      {/* One red End button. It never gets the chance to matter. change 17
          (A1): the circle's bottom edge sits 64px above the screen bottom
          at design scale (gate 101). */}
      <div data-call-end className="absolute inset-x-0 bottom-[38px] flex flex-col items-center gap-2">
        <span data-call-end-btn className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF3B30] text-white">
          <HandsetGlyph />
        </span>
        <span className="text-[12px] text-white/90">{COPY.call.endLabel}</span>
      </div>

      {/* The banner beat (step 2): the business's text arrives as an iOS
          notification banner sliding down over the dead call screen.
          change 17 (C1): top edge 8px below the 36px status row — clear of
          the notch at every width — title one line, body clamped to TWO
          lines with the ellipsis on line two (the full approved text stays
          in the DOM; the clamp is visual). change 27 (C2): the element
          LEAVES the DOM 2.6s after it lands — gate 166. */}
      {showBanner && (
      <div
        data-banner
        className="absolute inset-x-3 top-[56px] z-40"
        style={{ transform: "translateY(-140%)", opacity: 0 }}
      >
        <div
          className="rounded-2xl p-3 font-phone"
          style={{
            background: "rgba(9, 17, 31, 0.88)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <MessagesGlyph />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[14px] font-semibold text-ink">{bizName}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted">{COPY.notify.nowLabel}</span>
              </div>
              <div
                data-banner-body
                className="text-[13px] leading-snug text-muted"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {preset.thread[0].text}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default function Phone({
  preset,
  bizName,
  screenMinHeight,
  typingBefore = [],
  showNotification = false,
  variant = "live",
  staticId,
  skinThread = false,
  slab = false,
  sonar = false,
  headerGhost = false,
  showBanner = true,
  showConfirm = true,
}: {
  preset: Preset;
  /* The effective business name (custom or preset default). Falls back to the
     preset's own bizName so static compositions (OG) need not pass it. */
  bizName?: string;
  /* OG crop mode: a fixed screen height instead of the 19.5:9 device box.
     The OG canvas crops the composition; the interactive page never uses it. */
  screenMinHeight?: number;
  /* Bubble indices that get a typing indicator rendered before them. */
  typingBefore?: number[];
  /* OG composition only: the owner notification rendered statically visible —
     there is no rAF phase on the OG page to slide it in. */
  showNotification?: boolean;
  /* change 12: "static" renders the SETTLED thread only — no call screen, no
     banner, no typing rows, no notification, and NONE of the playback/gate
     data attributes (data-bubble, data-row, data-biz-name, …). The playback
     engine binds by those attributes, so a static instance is invisible to
     it, and the gates' whole-page tallies (bubble count, single bizName)
     still see exactly one live phone. */
  variant?: "live" | "static";
  /* change 15 (A4): a static instance that is the section-3 live-skin device
     marks its contact header data-crop-biz=<id> (gate 78) ... */
  staticId?: string;
  /* ... and re-skins the thread's own bizName mentions to the effective name
     — a pure substitution inside the approved strings, no new copy. */
  skinThread?: boolean;
  /* change 18 (C1): the accent slab — a solid band 62% of the device width,
     centered 18% left of the device center, running the full section height
     (the section's overflow clips it). It lives INSIDE the device box so it
     zooms and travels with the phone; painted before the bezel, so the
     phone breaks its edge. */
  slab?: boolean;
  /* change 26 (E3): the "Something else" preset with no typed name shows
     its contact name as an italic secondary placeholder. */
  headerGhost?: boolean;
  /* change 18 (D1): the sonar ring pair, centered on the screen center,
     behind the phone. Pure engine-driven SVG — no CSS animation. */
  sonar?: boolean;
  /* change 27 (C2): the engine unmounts the banner 2.6s after it lands;
     replay and re-arm remount it. Live section-1 instance only. */
  showBanner?: boolean;
  /* change 29: the booking-confirmation card leaves the DOM 3.0s after it
     lands, same contract. Live section-1 instance only. */
  showConfirm?: boolean;
}) {
  const thread = preset.thread;
  const typing = new Set(typingBefore);
  const effectiveBizName = bizName ?? preset.bizName;
  /* Aspect mode is the real device: box locked to 19.5:9, height follows
     width. OG crop mode keeps the old fixed-height screen. */
  const aspect = screenMinHeight == null;
  const live = variant === "live";
  /* Gate/engine attributes only exist on the live instance. A static
     instance carries its own "data-s-" namespace where a gate needs to
     measure it (74/83/87) without polluting the live tallies. */
  const mark = (attrs: Record<string, string | number | boolean>) => (live ? attrs : {});
  const markEither = (liveName: string, staticName: string, value: string | boolean = true) =>
    live ? { [liveName]: value } : { [staticName]: value };
  const skinText = (t: string) =>
    skinThread && !live ? t.replace(preset.bizName, effectiveBizName) : t;

  /* change 26 (C4): one grounded shadow on every instance — the inner
     specular line lives on the masked border element, not here. */
  const bezelShadow: CSSProperties = {
    boxShadow: "0 40px 60px rgba(0,0,0,0.35), 0 4px 6px rgba(0,0,0,0.6)",
  };

  const screenContent = (
    <>
      {/* change 30 (B1): the Dynamic Island — 126x37 pill, r18.5, pure
          black, centered, 11px off the screen top. The status items sit
          beside it at its height. */}
      <div
        data-island
        className="absolute left-1/2 top-[11px] z-40 h-[37px] w-[126px] -translate-x-1/2 rounded-[18.5px] bg-black"
      />

      {/* Status row — centered on the Island's band. */}
      <div className="relative z-10 flex h-[48px] shrink-0 items-center justify-between px-6 pt-[11px]">
        <span className="text-[13px] font-semibold tabular-nums text-white">
          {COPY.chrome.phone.statusTime}
        </span>
        <StatusGlyphs />
      </div>

      {/* Contact header */}
      <div data-phone-header className="shrink-0 border-b border-line bg-surface-2 px-6 pb-3 pt-2 text-center">
        <div
          {...(live ? { "data-biz-name": true } : staticId ? { "data-crop-biz": staticId } : {})}
          className={`text-[15px] leading-tight ${headerGhost ? "font-normal italic text-muted" : "font-semibold text-ink"}`}
        >
          {effectiveBizName}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">{COPY.chrome.textMessageLabel}</div>
      </div>

      {/* The thread box. The call card is gone (change 11, step 3): it
          carried the owner's POV. The thread opens directly with the
          business's auto-text at its timestamp; the banner beat fills
          t=0-5.6, so the first thread frame is never an empty box. */}
      <div
        {...markEither("data-thread-viewport", "data-s-viewport")}
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-5 pt-4"
      >
        <div
          /* overflow-hidden matters: an overflowing justify-end box spills
             past its START edge, so without it a thread taller than the
             box would spill over the contact header at very narrow widths.
             Clipped, it degrades like a scrolled thread.
             change 13 (S2a): STATIC instances anchor the thread to the TOP —
             their device bleeds off the section bottom, so the thread must
             start at its first bubble and clip from the bottom, never the
             top. The live phone keeps the bottom-anchored real-thread look. */
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
            aspect && live ? "justify-end" : "justify-start"
          }`}
        >
          {/* change 28 (E1): a static reference phone opens its thread 16px
              under the header; the live playback instance keeps 12. */}
          <div {...markEither("data-thread-area", "data-s-thread-area")} className={`flex flex-col ${aspect && live ? "pt-3" : "pt-4"}`}>
            {thread.map((b, i) => {
              const prev = thread[i - 1];
              const next = thread[i + 1];
              const senderChange = !prev || prev.from !== b.from;
              const runEnd = !next || next.from !== b.from;

              return (
                <Fragment key={i}>
                  {live && typing.has(i) && <TypingRow index={i} right={b.from === "customer"} />}

                  {/* iOS spacing (C1c): 8px between senders, 2px within a
                      same-sender run; the time label rides the sender change. */}
                  <div
                    {...mark({ "data-row": i })}
                    className={`flex flex-col ${i === 0 ? "" : senderChange ? "mt-2" : "mt-0.5"}`}
                  >
                    {senderChange && (
                      <div className="pb-1.5 pt-2 text-center text-[11px] tabular-nums text-muted">
                        {/* change 17 (C3): "Today " before the thread's
                            opening timestamp only — iOS's day marker. */}
                        {i === 0 && <span className="font-semibold">{COPY.chrome.todayPrefix}</span>}
                        {b.time}
                      </div>
                    )}

                    {/* HER phone (change 11): her replies are outgoing —
                        right, teal; the business's texts are incoming —
                        left, surface. The old orientation was the owner's
                        POV. */}
                    {/* change 19 (B5): the auto-reply tag under the FIRST
                        business bubble only — the one Salvage sent. */}
                    {b.from === "customer" ? (
                      <div className="flex justify-end">
                        <div
                          {...markEither("data-bubble", "data-s-bubble", "customer")}
                          className={`relative max-w-[72%] rounded-[20px] bg-[#34C759] px-[14px] py-2 text-[17px] leading-[1.29] text-white ${
                            runEnd ? "rounded-br-[6px]" : ""
                          }`}
                        >
                          {skinText(b.text)}
                          {runEnd && <BubbleTail side="right" color="#34C759" />}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start">
                        <div
                          {...markEither("data-bubble", "data-s-bubble", "business")}
                          className={`relative max-w-[72%] rounded-[20px] bg-[var(--accent,#1E3A5C)] px-[14px] py-2 text-[17px] leading-[1.29] text-[var(--accent-ink,#E9EEF4)] ${
                            runEnd ? "rounded-bl-[6px]" : ""
                          }`}
                        >
                          {skinText(b.text)}
                          {runEnd && <BubbleTail side="left" color="var(--accent, #1E3A5C)" />}
                        </div>
                        {i === 0 && (
                          <div
                            data-auto-reply
                            className="mt-0.5 pl-2 text-[12px]"
                            style={{ color: "color-mix(in srgb, var(--accent, #8AA0B4) 60%, transparent)" }}
                          >
                            {COPY.chrome.autoReplyTag}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}

            <div {...markEither("data-delivered", "data-s-delivered")} className="mt-0.5 pr-1 pt-1 text-right text-[11px] text-muted">
              {COPY.chrome.phone.deliveredLabel}
            </div>
          </div>
        </div>
      </div>

      {/* change 26 (C1): the iOS compose bar — 36px field, camera left,
          mic in the field's right end. Scenery; the call screen overlays
          it during the open. */}
      <div data-compose className="flex shrink-0 items-center gap-2.5 px-3 pb-8 pt-1.5 font-phone">
        {/* change 30 (B4): the circled "+" — 28px surface-3 disc, 14px
            stroke plus. */}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#8AA0B4" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M7 1.5v11M1.5 7h11" />
          </svg>
        </span>
        <div className="relative flex h-9 min-w-0 flex-1 items-center rounded-[18px] border border-line bg-surface-2 pl-3.5 pr-9">
          <span className="truncate text-[16px] text-ink opacity-60">{COPY.chrome.composePlaceholder}</span>
          <svg className="absolute right-2.5" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8AA0B4" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <rect x="6.6" y="1.5" width="4.8" height="9" rx="2.4" fill="#8AA0B4" stroke="none" />
            <path d="M3.5 8.5a5.5 5.5 0 0 0 11 0M9 14v2.5M6.5 16.5h5" />
          </svg>
        </div>
      </div>

      {/* The outgoing-call opening lives only on the LIVE interactive device;
          a static instance is the settled thread and nothing else. */}
      {aspect && live && <CallScreen preset={preset} bizName={effectiveBizName} showBanner={showBanner} />}

      {/* HER phone's closing beat: the booking confirmation from the
          business — Messages identity, not the owner's Salvage alert (that
          card belongs on the ledger side only; change 11 review). Existing
          approved strings recomposed, no new copy. Slides down from the top
          like every push she has ever received. Live instances only: the
          static settled phone (change 12) has no closing beat.
          change 29: the element leaves the DOM 3.0s after landing — gate
          169. */}
      {live && showConfirm && (
      <div
        data-notify-phone
        className="absolute inset-x-3 top-[52px] z-40"
        style={
          showNotification
            ? { transform: "none", opacity: 1 }
            : { transform: "translateY(-140%)", opacity: 0 }
        }
      >
        <div
          className="rounded-2xl p-3 font-phone"
          style={{
            background: "rgba(9, 17, 31, 0.88)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <MessagesGlyph />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[14px] font-semibold text-ink">{effectiveBizName}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted">{COPY.notify.nowLabel}</span>
              </div>
              <div className="truncate text-[13px] leading-snug text-muted">
                {COPY.notify.bookedLabel} · {preset.caught[0].detail} · ${preset.caught[0].amount}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Home indicator. Muted, low-alpha: chrome, not content. */}
      <div className="absolute bottom-2 left-1/2 z-50 h-1.25 w-35 -translate-x-1/2 rounded-full bg-muted/30" />

      {/* change 17 (B2): one diagonal specular streak over the glass —
          above everything, catching no pointer. Subtle by construction. */}
      <div
        aria-hidden="true"
        data-screen-streak
        className="pointer-events-none absolute inset-0 z-[60]"
        style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.03) 0%, transparent 22%)" }}
      />
    </>
  );

  /* change 16 (A1): the SCREEN lays out at a 390px design width — text,
     bubbles, banner, status row, notch, home bar, call screen all in design
     px — and the whole screen zooms to the rendered device width (change
     14's screenshot method, moved onto the screen itself). Width and zoom
     live in globals.css on [data-phone-screen]; only the design HEIGHT
     differs per mode. 874 is the aspect box's screen height mapped back to
     design scale: (390 × 19.5/9 − 24) ÷ ((390 − 24) / 390) ≈ 874.8, floored
     so the zoomed screen never overflows the bezel. */
  const DESIGN_ZOOM = (390 - 24) / 390;

  if (!aspect) {
    /* OG crop mode: fixed rendered screen height, device cropped by the
       canvas — the design height is that height mapped back to design px. */
    return (
      <div data-phone-device data-client-world className="w-[390px] max-w-full shrink-0">
        <div className="relative rounded-[56px] bg-[#05090F] p-3 ring-1 ring-inset ring-line/60" style={bezelShadow}>
          <div data-screen-fit>
            <div
              data-phone-screen
              className="relative flex flex-col overflow-hidden rounded-[44px] bg-surface font-phone"
              style={{ height: Math.round(screenMinHeight / DESIGN_ZOOM) }}
            >
              {screenContent}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* The real device: 19.5:9 box (gate 46), 12px bezel, 44px design-scale
     screen radius inside a 56px outer radius (C1d). Height always follows
     width; the screen zooms uniformly inside the bezel. */
  return (
    <div
      data-phone-device
      data-client-world
      {...(live ? {} : { "data-phone-static": true })}
      className="relative mx-auto aspect-[9/19.5] w-full max-w-[390px] shrink-0"
    >
      {/* z -1: the device wrapper creates no stacking context, so the slab
          and rings escape BEHIND the section's content — a flex `order`ed
          sibling would otherwise paint the full-height band over the
          section's text (change 18 review, lens 1 finding 1). */}
      {/* change 26 (A2): the slab's right edge lands at 33% of the device
          width — the band sits mostly LEFT of the phone and the phone
          breaks its edge through its left third. */}
      {slab && (
        <div
          aria-hidden="true"
          data-accent-slab
          data-slab
          className="absolute -left-[31.1%] -z-1 w-[62%] bg-[var(--accent-soft,#0F1E33)]"
          style={{ top: "-150vh", bottom: "-150vh" }}
        />
      )}
      {sonar && (
        <svg
          aria-hidden="true"
          data-sonar
          className="pointer-events-none absolute left-1/2 top-1/2 -z-1 -translate-x-1/2 -translate-y-1/2"
          width="2800"
          height="2800"
          viewBox="0 0 2800 2800"
        >
          <circle data-sonar-ring="0" cx="1400" cy="1400" r="0" fill="none" stroke="var(--accent, var(--color-teal))" strokeWidth="1" opacity="0" />
          <circle data-sonar-ring="1" cx="1400" cy="1400" r="0" fill="none" stroke="var(--accent, var(--color-teal))" strokeWidth="1" opacity="0" />
        </svg>
      )}
      {/* change 17 (B1): hardware nubs — two volume (44px, 14px gap) left,
          one power (64px) right, 6px proud of the frame, one step lighter
          than the bezel. Aluminum, not UI. */}
      <div aria-hidden="true" data-nub className="absolute -left-1.5 top-[168px] h-11 w-1.5 rounded-l-[3px] bg-[#0D1626]" />
      <div aria-hidden="true" data-nub className="absolute -left-1.5 top-[226px] h-11 w-1.5 rounded-l-[3px] bg-[#0D1626]" />
      <div aria-hidden="true" data-nub className="absolute -right-1.5 top-[186px] h-16 w-1.5 rounded-r-[3px] bg-[#0D1626]" />

      <div
        className="absolute inset-0 rounded-[56px] bg-[#05090F] p-3 ring-1 ring-inset ring-line/60"
        style={bezelShadow}
      >
        {/* change 17 (B1): 1px inner specular — white 8% fading out along
            the top and left edges only, drawn as a masked gradient border. */}
        <div
          aria-hidden="true"
          data-specular
          className="pointer-events-none absolute inset-0 z-10 rounded-[56px]"
          style={{
            padding: 1,
            background: "linear-gradient(135deg, rgba(255,255,255,0.08), transparent 55%)",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            maskComposite: "exclude",
          }}
        />
        <div data-screen-fit className="flex h-full items-center justify-center">
          <div
            data-phone-screen
            className="relative flex flex-col overflow-hidden rounded-[44px] bg-surface font-phone"
            style={{ height: 874 }}
          >
            {screenContent}
          </div>
        </div>
      </div>
    </div>
  );
}
