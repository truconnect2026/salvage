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
  return (
    <svg
      width="16"
      height="12"
      viewBox="0 0 16 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M0.9 3.5A9 9 0 0 1 15.1 3.5" />
      <path d="M3.5 6.1A6 6 0 0 1 12.5 6.1" />
      <path d="M6 8.7A3 3 0 0 1 10 8.7" />
      <path d="M8 10.6a1 1 0 0 1 0 1.4a1 1 0 0 1 0-1.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StatusGlyphs() {
  return (
    <span data-status-cluster className="flex items-center gap-[6px] text-muted">
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
        strokeWidth="1.1"
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
          right ? "bg-teal" : "bg-surface-3"
        }`}
      >
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            data-dot={d}
            className={`h-[7px] w-[7px] rounded-full ${right ? "bg-abyss/60" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* The iOS Messages app mark: green squircle, white speech-bubble path. */
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
function CallScreen({ preset, bizName }: { preset: Preset; bizName: string }) {
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
          <span className="text-[22px] font-semibold text-muted">{initialsOf(bizName)}</span>
        </div>
        <div data-call-biz className="mt-4 text-[26px] font-medium leading-tight text-ink">
          {bizName}
        </div>
        <div data-call-status className="mt-1.5 text-[14px] text-muted">
          <span data-call-status-stem>{COPY.call.callingLabel.replace(/…$/, "")}</span>
          <span data-call-dots>…</span>
        </div>

        {/* change 17 (A1): the six-button iOS in-call grid. Scenery — it
            never takes a tap; the demo's one live control on this screen
            stays the (equally decorative) End button. */}
        <div data-call-grid className="pointer-events-none mt-14 grid grid-cols-3 gap-x-9 gap-y-5">
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
          in the DOM; the clamp is visual). */}
      <div
        data-banner
        className="absolute inset-x-3 top-[44px] z-40"
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
  /* change 18 (D1): the sonar ring pair, centered on the screen center,
     behind the phone. Pure engine-driven SVG — no CSS animation. */
  sonar?: boolean;
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

  const bezelShadow: CSSProperties = {
    boxShadow:
      "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 44px 90px -28px rgba(0,0,0,0.9), 0 8px 28px -12px rgba(0,0,0,0.7)",
  };

  const screenContent = (
    <>
      {/* Notch (change 16, A2): 34% of the screen's design width, 30px tall
          at design scale. Time and the status glyphs both live outside it at
          every rendered width — the whole screen scales as one unit. */}
      <div
        data-notch
        className="absolute left-1/2 top-0 z-40 h-[30px] w-[34%] -translate-x-1/2 rounded-b-[14px] bg-[#05090F]"
      />

      {/* Status row */}
      <div className="relative z-10 flex h-[36px] shrink-0 items-center justify-between px-6 pt-1">
        <span className="text-[13px] font-semibold tabular-nums text-ink">
          {COPY.chrome.phone.statusTime}
        </span>
        <StatusGlyphs />
      </div>

      {/* Contact header */}
      <div className="shrink-0 border-b border-line bg-surface-2 px-6 pb-3 pt-2 text-center">
        <div
          {...(live ? { "data-biz-name": true } : staticId ? { "data-crop-biz": staticId } : {})}
          className="text-[15px] font-semibold leading-tight text-ink"
        >
          {effectiveBizName}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">{COPY.chrome.phone.threadLabel}</div>
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
          <div {...markEither("data-thread-area", "data-s-thread-area")} className="flex flex-col pt-3">
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
                          className={`max-w-[72%] rounded-[20px] bg-teal px-[14px] py-2 text-[17px] leading-[1.29] text-abyss ${
                            runEnd ? "rounded-br-[6px]" : ""
                          }`}
                        >
                          {skinText(b.text)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start">
                        <div
                          {...markEither("data-bubble", "data-s-bubble", "business")}
                          className={`max-w-[72%] rounded-[20px] bg-surface-3 px-[14px] py-2 text-[17px] leading-[1.29] text-ink ${
                            runEnd ? "rounded-bl-[6px]" : ""
                          }`}
                        >
                          {skinText(b.text)}
                        </div>
                        {i === 0 && (
                          <div data-auto-reply className="mt-0.5 pl-2 text-[10px] text-muted">
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

      {/* The outgoing-call opening lives only on the LIVE interactive device;
          a static instance is the settled thread and nothing else. */}
      {aspect && live && <CallScreen preset={preset} bizName={effectiveBizName} />}

      {/* HER phone's closing beat: the booking confirmation from the
          business — Messages identity, not the owner's Salvage alert (that
          card belongs on the ledger side only; change 11 review). Existing
          approved strings recomposed, no new copy. Slides down from the top
          like every push she has ever received. Live instances only: the
          static settled phone (change 12) has no closing beat. */}
      {live && (
      <div
        data-notify-phone
        className="absolute inset-x-3 top-3 z-40"
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
      <div data-phone-device className="w-[390px] max-w-full shrink-0">
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
      {...(live ? {} : { "data-phone-static": true })}
      className="relative mx-auto aspect-[9/19.5] w-full max-w-[390px] shrink-0"
    >
      {/* z -1: the device wrapper creates no stacking context, so the slab
          and rings escape BEHIND the section's content — a flex `order`ed
          sibling would otherwise paint the full-height band over the
          section's text (change 18 review, lens 1 finding 1). */}
      {slab && (
        <div
          aria-hidden="true"
          data-accent-slab
          className="absolute left-[1%] -z-1 w-[62%] bg-surface"
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
          <circle data-sonar-ring="0" cx="1400" cy="1400" r="0" fill="none" stroke="var(--color-teal)" strokeWidth="1" opacity="0" />
          <circle data-sonar-ring="1" cx="1400" cy="1400" r="0" fill="none" stroke="var(--color-teal)" strokeWidth="1" opacity="0" />
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
