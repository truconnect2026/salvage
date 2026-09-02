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
    <span className="flex items-center gap-[6px] text-muted">
      <SignalGlyph />
      <WifiGlyph />
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
  return (
    <div
      className="rounded-2xl p-3 font-phone"
      style={{
        background: "rgba(9, 17, 31, 0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal">
          <span className="font-display text-[13px] font-semibold leading-none text-abyss">S</span>
        </span>
        <span className="text-[11px] font-medium text-muted">{COPY.notify.appTag}</span>
        <span className="ml-auto text-[11px] text-muted">{COPY.notify.nowLabel}</span>
      </div>
      <div className="mt-1.5 truncate text-[14px] font-semibold leading-snug text-ink">
        {bizName} · {COPY.notify.bookedLabel}
      </div>
      <div className="mt-0.5 truncate text-[13px] leading-snug text-muted">
        {entry.detail} · ${entry.amount}
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
          right ? "bg-teal" : "bg-surface-2"
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
      <div className="absolute right-6 top-2 z-10 flex items-center gap-[6px] text-muted">
        <SignalGlyph />
        <WifiGlyph />
        <BatteryGlyph />
      </div>

      {/* Upper third: who she's calling, and how it's going. */}
      <div className="flex w-full flex-col items-center pt-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
          <span className="text-[22px] font-medium text-muted">{initialsOf(bizName)}</span>
        </div>
        <div data-call-biz className="mt-4 text-[26px] font-medium leading-tight text-ink">
          {bizName}
        </div>
        <div data-call-status className="mt-1.5 text-[14px] text-muted">
          <span data-call-status-stem>{COPY.call.callingLabel.replace(/…$/, "")}</span>
          <span data-call-dots>…</span>
        </div>
      </div>

      {/* The 30% dim that lands when the call dies. */}
      <div
        data-call-dim
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: 0 }}
      />

      {/* One red End button. It never gets the chance to matter. */}
      <div data-call-end className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-2">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF3B30] text-white">
          <HandsetGlyph />
        </span>
        <span className="text-[12px] text-white/90">{COPY.call.endLabel}</span>
      </div>

      {/* The banner beat (step 2): the business's text arrives as an iOS
          notification banner sliding down over the dead call screen. 12px
          inset; blurred-dark card; first ~80 chars of the auto-text. */}
      <div
        data-banner
        className="absolute inset-x-3 top-3 z-40"
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
              <div className="truncate text-[13px] leading-snug text-muted">
                {preset.thread[0].text.slice(0, 80)}…
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
     measure it (74/75) without polluting the live tallies. */
  const mark = (attrs: Record<string, string | number | boolean>) => (live ? attrs : {});
  const markEither = (liveName: string, staticName: string, value: string | boolean = true) =>
    live ? { [liveName]: value } : { [staticName]: value };

  const bezelShadow: CSSProperties = {
    boxShadow:
      "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 44px 90px -28px rgba(0,0,0,0.9), 0 8px 28px -12px rgba(0,0,0,0.7)",
  };

  const screenContent = (
    <>
      {/* Notch */}
      <div className="absolute left-1/2 top-0 z-40 h-[26px] w-[120px] -translate-x-1/2 rounded-b-[14px] bg-[#05090F]" />

      {/* Status row */}
      <div className="relative z-10 flex h-[36px] shrink-0 items-center justify-between px-6 pt-1">
        <span className="text-[13px] font-semibold tabular-nums text-ink">
          {COPY.chrome.phone.statusTime}
        </span>
        <span className="flex items-center gap-[6px] text-muted">
          <SignalGlyph />
          <WifiGlyph />
          <BatteryGlyph />
        </span>
      </div>

      {/* Contact header */}
      <div className="shrink-0 border-b border-line bg-surface-2 px-6 pb-3 pt-2 text-center">
        <div {...mark({ "data-biz-name": true })} className="text-[15px] font-semibold leading-tight text-ink">
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
                        {b.time}
                      </div>
                    )}

                    {/* HER phone (change 11): her replies are outgoing —
                        right, teal; the business's texts are incoming —
                        left, surface. The old orientation was the owner's
                        POV. */}
                    {b.from === "customer" ? (
                      <div className="flex justify-end">
                        <div
                          {...markEither("data-bubble", "data-s-bubble", "customer")}
                          className={`max-w-[72%] rounded-[20px] bg-teal px-[14px] py-2 text-[17px] leading-[1.29] text-abyss ${
                            runEnd ? "rounded-br-[6px]" : ""
                          }`}
                        >
                          {b.text}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-start">
                        <div
                          {...markEither("data-bubble", "data-s-bubble", "business")}
                          className={`max-w-[72%] rounded-[20px] bg-surface-2 px-[14px] py-2 text-[17px] leading-[1.29] text-ink ${
                            runEnd ? "rounded-bl-[6px]" : ""
                          }`}
                        >
                          {b.text}
                        </div>
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
    </>
  );

  if (!aspect) {
    /* OG crop mode: fixed screen height, device cropped by the canvas. */
    return (
      <div data-phone-device className="w-[390px] max-w-full shrink-0">
        <div className="relative rounded-[56px] bg-[#05090F] p-3 ring-1 ring-inset ring-line/60" style={bezelShadow}>
          <div
            data-phone-screen
            className="relative flex flex-col overflow-hidden rounded-[44px] bg-surface font-phone"
            style={{ minHeight: screenMinHeight }}
          >
            {screenContent}
          </div>
        </div>
      </div>
    );
  }

  /* The real device: 19.5:9 box (gate 46), 12px bezel, 44px screen radius
     inside a 56px outer radius (C1d). Height always follows width. */
  return (
    <div
      data-phone-device
      {...(live ? {} : { "data-phone-static": true })}
      className="relative mx-auto aspect-[9/19.5] w-full max-w-[390px] shrink-0"
    >
      <div
        className="absolute inset-0 rounded-[56px] bg-[#05090F] p-3 ring-1 ring-inset ring-line/60"
        style={bezelShadow}
      >
        <div
          data-phone-screen
          className="relative flex h-full flex-col overflow-hidden rounded-[44px] bg-surface font-phone"
        >
          {screenContent}
        </div>
      </div>
    </div>
  );
}
