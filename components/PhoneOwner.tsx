import { type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { HandsetGlyph, PhoneDevice, StatusGlyphs, initialsOf } from "@/components/PhoneParts";
import { COPY, type Preset } from "@/lib/client.config";

/* change 43a: the OWNER's phone — the s1 device now belongs to the
   business. Three stacked layers, one shown at a time by the rAF engine in
   Demo.tsx (it owns every opacity and transform here):
     incoming  the locked incoming call: the caller, the business line
               it rings, Decline, slide to answer
     in-call   an answered call: the caller and its running timer
     lock      the lock screen the rescue lands on: Missed call, Text sent,
               Booked, newest on top
   The SSR / no-JS / reduced-motion floor is the settled booked lock screen. */
export type OwnerHandlers = {
  onDecline: () => void;
  onSlideDown: (e: PointerEvent<HTMLElement>) => void;
  onSlideMove: (e: PointerEvent<HTMLElement>) => void;
  onSlideUp: (e: PointerEvent<HTMLElement>) => void;
  onSlideKey: (e: KeyboardEvent<HTMLElement>) => void;
  /* change 43a.1: reduced motion answers on a TAP of the track. */
  onSlideTap: () => void;
};

/* The iPhone Phone app mark: green squircle, white handset. */
function PhoneAppGlyph() {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-[#34C759]">
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M13.6 11.3l-2.1-1.5a1 1 0 0 0-1.3.2l-.7.9a9.6 9.6 0 0 1-3.4-3.4l.9-.7a1 1 0 0 0 .2-1.3L5.7 3.4a1 1 0 0 0-1.4-.2l-1 .8a1.7 1.7 0 0 0-.5 1.8 13.2 13.2 0 0 0 8.4 8.4 1.7 1.7 0 0 0 1.8-.5l.8-1a1 1 0 0 0-.2-1.4z"
          fill="white"
        />
      </svg>
    </span>
  );
}

/* The Salvage mark on the owner's notifications — ink (change 45.1). */
function OwnerSMark() {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-ink">
      <span className="font-display text-[14px] font-semibold leading-none text-abyss">{COPY.productName.charAt(0)}</span>
    </span>
  );
}

function OwnerNote({ kind, children, icon }: { kind: "booked" | "text" | "missed"; children: ReactNode; icon: ReactNode }) {
  return (
    /* The outer box is the push: the engine grows its height from 0 so the
       older notes slide down under a new one. The 8px gap is the CARD's
       margin, inside the box (a flex item contains its child's margins),
       so a note that has not landed takes no room at all. */
    <div data-owner-note={kind}>
      <div data-owner-note-card className="mb-2 rounded-[18px] bg-[rgba(44,44,46,0.92)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="ml-auto text-[12px] text-white/60">{COPY.notify.nowLabel}</span>
        </div>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}

function OwnerScreen({
  preset,
  bizName,
  handlers,
  credit = 0,
}: {
  preset: Preset;
  bizName: string;
  handlers?: OwnerHandlers;
  /* change 43a.1: which caller Salvage caught — 0, the first caller (the
     call rang out or was declined), or 1, the SECOND caller (the owner
     answered the first and was out on it when the second rang out). The
     engine flips it once both incoming screens are down. */
  credit?: 0 | 1;
}) {
  const entry = preset.caught[credit];
  const second = preset.caught[1];
  const autoText = preset.thread[0].text.replace(preset.bizName, bizName);
  return (
    <>
      {/* LOCK — the settled floor, visible in SSR. */}
      <div data-owner-lock className="absolute inset-0 z-10 flex flex-col items-center px-3" style={{ opacity: 1 }}>
        <p className="mt-[68px] text-[18px] font-medium text-white/85">{COPY.chrome.phone.lockDate}</p>
        <p data-owner-clock className="mt-0.5 text-[84px] font-semibold leading-none tracking-[-0.02em] text-white/95 tabular-nums">{COPY.chrome.phone.statusTime}</p>
        <div data-owner-notes className="mt-6 flex w-full flex-col">
          <OwnerNote kind="booked" icon={<OwnerSMark />}>
            <p className="text-[15px] font-semibold leading-snug text-white">{COPY.notify.bookedLabel}</p>
            <p className="text-[15px] leading-snug text-white/85">
              {entry.name} · {entry.detail} · ${entry.amount}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-white/60">{COPY.ledger.calendarLine}</p>
          </OwnerNote>
          <OwnerNote kind="text" icon={<OwnerSMark />}>
            <p className="text-[15px] font-semibold leading-snug text-white">{COPY.beats.text}</p>
            <p
              className="text-[15px] leading-snug text-white/85"
              style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {autoText}
            </p>
          </OwnerNote>
          <OwnerNote kind="missed" icon={<PhoneAppGlyph />}>
            <p className="text-[15px] font-semibold leading-snug text-white">{COPY.beats.missed}</p>
            <p className="text-[15px] leading-snug text-white/85">{credit === 1 ? second.name : preset.customerName}</p>
          </OwnerNote>
        </div>
        {/* The lock screen's two hardware shortcuts — flashlight left,
            camera right. Scenery: glyphs only, no copy. */}
        <div data-owner-shortcuts aria-hidden="true" className="absolute inset-x-[42px] bottom-[42px] flex justify-between">
          {[
            "M9 3h6l-1 5v2l-1.5 2v8.5a1.5 1.5 0 0 1-3 0V12L8 10V8L9 3zM8.5 8h7",
            "M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
          ].map((d) => (
            <span key={d} className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white/15">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinejoin="round">
                <path d={d} />
              </svg>
            </span>
          ))}
        </div>
      </div>

      {/* IN-CALL — an answered call. Hidden in SSR. */}
      <div data-owner-incall className="absolute inset-0 z-20 flex flex-col items-center bg-black" style={{ opacity: 0, visibility: "hidden" }}>
        <p className="mt-[118px] text-[30px] font-medium leading-tight text-white">{preset.customerName}</p>
        <p data-owner-timer className="mt-1.5 text-[17px] tabular-nums text-white/70">
          0:00
        </p>
        <div className="absolute inset-x-0 bottom-[64px] flex flex-col items-center gap-2">
          <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#FF3B30] text-white">
            <HandsetGlyph />
          </span>
          <span className="text-[13px] text-white/90">{COPY.call.endLabel}</span>
        </div>
      </div>

      {/* INCOMING — the locked incoming call. Hidden in SSR; the engine
          shows it the moment playback arms. */}
      <div data-owner-incoming className="absolute inset-0 z-30 flex flex-col items-center bg-black" style={{ opacity: 0, visibility: "hidden" }}>
        {/* The line it is ringing — the business's own number — labelled
            the way iOS labels a second line: a lettered tile and the line's
            name, ABOVE the caller, so it never reads as the caller's
            company. */}
        <p data-owner-line className="mt-[80px] flex max-w-full items-center gap-1.5 px-6 text-[15px] text-white/70">
          <span aria-hidden="true" className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-white/25 text-[11px] font-semibold leading-none text-white">
            {initialsOf(bizName).charAt(0)}
          </span>
          <span data-biz-name className="truncate">
            {bizName}
          </span>
        </p>
        <p data-owner-caller className="mt-2 text-[34px] font-medium leading-tight text-white">
          {preset.customerName}
        </p>
        {/* change 43a.1: the SECOND caller — the engine swaps the two names
            (display) when the second call comes up. */}
        <p data-owner-caller-2 className="mt-2 text-[34px] font-medium leading-tight text-white" style={{ display: "none" }}>
          {second.name}
        </p>
        <div className="absolute inset-x-0 bottom-[156px] flex flex-col items-center gap-2">
          <button
            type="button"
            data-owner-decline
            onClick={handlers?.onDecline}
            className="relative flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#FF3B30] text-white outline-none before:absolute before:-inset-5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
            aria-label={COPY.call.decline}
          >
            <HandsetGlyph />
          </button>
          <span aria-hidden="true" className="text-[13px] text-white/90">
            {COPY.call.decline}
          </span>
        </div>
        {/* Slide to answer: the whole TRACK takes the drag (a thumb lands
            anywhere on it — at a 0.5 screen scale the knob alone is ~33px);
            the engine owns the knob's transform and springs it home
            (DESIGN.md: k 420, c 34). */}
        <div
          data-owner-track
          onPointerDown={handlers?.onSlideDown}
          onPointerMove={handlers?.onSlideMove}
          onPointerUp={handlers?.onSlideUp}
          onPointerCancel={handlers?.onSlideUp}
          onClick={handlers?.onSlideTap}
          className="absolute bottom-[56px] left-[30px] right-[30px] h-[72px] cursor-grab touch-none select-none rounded-[36px] bg-white/15"
        >
          <span data-owner-slide-label aria-hidden="true" className="absolute inset-0 flex items-center justify-center pl-12 text-[18px] text-white/85">
            {COPY.call.slideToAnswer}
          </span>
          {/* change 43a.1: the second call's slider is disabled — the owner
              is out on the first call's job. Shown by the engine. */}
          <span
            data-owner-onajob
            className="absolute inset-0 flex items-center justify-center pl-12 text-[18px] text-white/85"
            style={{ display: "none" }}
          >
            {COPY.call.onAJob}
          </span>
          <div
            data-owner-knob
            role="button"
            tabIndex={0}
            aria-label={COPY.call.slideToAnswer}
            onKeyDown={handlers?.onSlideKey}
            className="absolute left-1 top-1 flex h-16 w-16 items-center justify-center rounded-full bg-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            style={{ transform: "translateX(0px)" }}
          >
            <span className="text-[#34C759]" style={{ transform: "rotate(-135deg)", display: "flex" }}>
              <HandsetGlyph />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/* The owner's phone: section 1's device (change 43a), on the shared shell. */
export default function PhoneOwner({
  preset,
  bizName,
  sonar = false,
  ownerHandlers,
  credit = 0,
}: {
  preset: Preset;
  bizName?: string;
  sonar?: boolean;
  ownerHandlers?: OwnerHandlers;
  credit?: 0 | 1;
}) {
  const effectiveBizName = bizName ?? preset.bizName;
  return (
    <PhoneDevice sonar={sonar}>
    <>
      <div data-island className="absolute left-1/2 top-[10px] z-40 h-[34px] w-[118px] -translate-x-1/2 rounded-[17px] bg-black" />
      <div className="relative z-40 flex h-[46px] shrink-0 items-center justify-between pl-6 pr-[14px] pt-[10px]">
        <span className="text-[15px] font-semibold tabular-nums text-white">{COPY.chrome.phone.statusTime}</span>
        <StatusGlyphs />
      </div>
      <OwnerScreen preset={preset} bizName={effectiveBizName} handlers={ownerHandlers} credit={credit} />
      <div className="absolute bottom-2 left-1/2 z-50 h-1.25 w-35 -translate-x-1/2 rounded-full bg-muted/30" />
      {/* The glass's one specular streak — same as every device. */}
      <div
        aria-hidden="true"
        data-screen-streak
        className="pointer-events-none absolute inset-0 z-[60]"
        style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.03) 0%, transparent 22%)" }}
      />
    </>
    </PhoneDevice>
  );
}
