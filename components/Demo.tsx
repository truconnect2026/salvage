"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import Ledger from "@/components/Ledger";
import Phone, { NotifyCard } from "@/components/Phone";
import { COPY, MAX_NAME_LEN, PRESETS, SHARE_ORIGIN, resolveName, type Preset } from "@/lib/client.config";
import { type LedgerDates } from "@/lib/dates";
import { usd } from "@/lib/format";
import {
  BANNER_AT,
  BANNER_IN,
  BEATS,
  BUBBLE_ENTER,
  BUBBLE_RISE,
  CALL_END_FADE_DUR,
  CALL_ENDED_AT,
  CALL_RINGING_AT,
  CAUGHT_ROW_RISE,
  CHIME_AT,
  CONTROLS_AT,
  CONTROLS_FADE,
  DELIVERED_AT,
  DOT_PERIOD,
  LAND_AT,
  LOOP_UNTIL,
  RING_BEATS,
  RING_BURST_DUR,
  SCENE_CAUGHT_AT,
  SCENE_DIALING_AT,
  SCENE_FADE,
  SHIMMER_AT,
  SHIMMER_DUR,
  SWAP_FADE,
  SWAP_ROLL,
  THREAD_FADE_AT,
  THREAD_FADE_DUR,
  THREAD_START,
  TYPING,
  caughtRowProgress,
  clamp01,
  easeOut,
  leakAt,
  notifyPresence,
  panelRecoveredAt,
} from "@/lib/timeline";

/* The status line's animated ellipsis renders stem + dots separately; the
   stems come from the approved copy with the literal ellipsis stripped. */
const CALL_STEMS = {
  calling: COPY.call.callingLabel.replace(/…$/, ""),
  ringing: COPY.call.ringingLabel.replace(/…$/, ""),
};

/* Section order IS the pager order (change 12, A1). */
const SECTIONS = [
  { id: "call", ...COPY.sections.call },
  { id: "save", ...COPY.sections.save },
  { id: "yours", ...COPY.sections.yours },
  { id: "math", ...COPY.sections.math },
] as const;

/* ---------------------------------------------------------------------------
 * The playback engine lives outside React on purpose. It is imperative DOM
 * animation, not state: one rAF loop owns the phase signal, and every animated
 * element derives from it — the call screen, the phone thread, the owner
 * ledger panel, the phone notification, the down-cue, the shimmer. No
 * per-beat timers, no second clock, and only this loop ever writes
 * transform/opacity/display on these nodes. (The 150ms name debounce and the
 * 4s cue dismissals are UI-plumbing timeouts that drive React state, never a
 * frame.)
 *
 * Change 12: the clock is ARMED at mount, not started. The pager's
 * IntersectionObserver begins playback when the "call" section is >= 60%
 * visible, and a preset switch re-arms it instead of restarting — the fresh
 * run begins when the user is back on section 1.
 * ------------------------------------------------------------------------- */

type Nodes = {
  rows: HTMLElement[];
  typings: Map<number, HTMLElement>;
  delivered: HTMLElement | null;
  bizName: HTMLElement | null;
  threadArea: HTMLElement | null;
  leak: HTMLElement | null;
  controls: HTMLElement | null;
  sceneClosed: HTMLElement | null;
  sceneDialing: HTMLElement | null;
  sceneCaught: HTMLElement | null;
  ledgerPanel: HTMLElement | null;
  caughtRow0: HTMLElement | null;
  panelRecovered: HTMLElement | null;
  call: HTMLElement | null;
  callStatusStem: HTMLElement | null;
  callDots: HTMLElement | null;
  callDim: HTMLElement | null;
  callEnd: HTMLElement | null;
  banner: HTMLElement | null;
  notifyPhone: HTMLElement | null;
  shimmer: HTMLElement | null;
};

/* ---------------------------------------------------------------------------
 * Sound (change 15, B). Web Audio synthesis only — no samples. Every event is
 * scheduled by the ONE rAF loop the moment the phase signal crosses its beat:
 * no setTimeout, no second scheduler, no other clock. Audio stays OFF until
 * the rail toggle's tap creates/resumes the AudioContext (the gesture
 * unlock); a session restore re-creates the context WITHOUT a gesture, which
 * the browser holds suspended until one arrives.
 * ------------------------------------------------------------------------- */

type AudioState = {
  actx: AudioContext | null;
  enabled: boolean;
  /* Phase at the previous tick — beats fire on (lastT, t] crossings. -1
     whenever the clock (re)starts, so beat 0.2 is crossable again. */
  lastT: number;
};

/* One AudioContext per page lifetime, module-scoped: React StrictMode
   double-mounts effects in dev, and a per-mount context would leak one
   instance per remount (gate 88/90 count constructor calls). */
let sharedAudioContext: AudioContext | null = null;
/* Every voice routes through one master gain (change 15 review, finding 2):
   toggling OFF ramps it to zero in ~30ms — silencing a ring tail already in
   flight — and then suspends the context so no audio hardware stays held. */
let sharedMasterGain: GainNode | null = null;

function ensureAudioContext(a: AudioState): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new AudioContext();
      sharedMasterGain = sharedAudioContext.createGain();
      sharedMasterGain.connect(sharedAudioContext.destination);
    } catch {
      sharedAudioContext = null;
      sharedMasterGain = null;
    }
  }
  a.actx = sharedAudioContext;
  return a.actx;
}

/* One ring burst: BOTH sines (440 + 480 Hz) from a single oscillator — they
   are harmonics 11 and 12 of a 40 Hz fundamental, so one PeriodicWave
   carries the exact pair. 20ms attack, 80ms release, gain 0.12. */
function playRing(actx: AudioContext, when: number) {
  const real = new Float32Array(13);
  const imag = new Float32Array(13);
  imag[11] = 1;
  imag[12] = 1;
  const osc = actx.createOscillator();
  osc.setPeriodicWave(actx.createPeriodicWave(real, imag));
  osc.frequency.value = 40;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.12, when + 0.02);
  g.gain.setValueAtTime(0.12, when + RING_BURST_DUR - 0.08);
  g.gain.linearRampToValueAtTime(0, when + RING_BURST_DUR);
  osc.connect(g).connect(sharedMasterGain ?? actx.destination);
  osc.start(when);
  osc.stop(when + RING_BURST_DUR + 0.05);
}

/* The banner chime: triangle gliding 880 -> 1320 Hz over 90ms, 220ms
   release, gain 0.10. */
function playChime(actx: AudioContext, when: number) {
  const osc = actx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(880, when);
  osc.frequency.linearRampToValueAtTime(1320, when + 0.09);
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.1, when + 0.015);
  g.gain.setValueAtTime(0.1, when + 0.09);
  g.gain.linearRampToValueAtTime(0, when + 0.31);
  osc.connect(g).connect(sharedMasterGain ?? actx.destination);
  osc.start(when);
  osc.stop(when + 0.36);
}

/* The landing tone: one 220 Hz sine, 60ms, gain 0.08 — the confirmation
   card touching down on her phone. */
function playLand(actx: AudioContext, when: number) {
  const osc = actx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 220;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.08, when + 0.008);
  g.gain.setValueAtTime(0.08, when + 0.04);
  g.gain.linearRampToValueAtTime(0, when + 0.06);
  osc.connect(g).connect(sharedMasterGain ?? actx.destination);
  osc.start(when);
  osc.stop(when + 0.1);
}

type Totals = { lost: number; panelRecovered: number };
type Transition = {
  at: number | null;
  from: Totals;
  to: Preset;
  /* Where the counters roll TO during the swap: the incoming preset's values at
     beat 0, not its finals. Rolling to the finals would climb and then drop to
     zero the moment playback restarts. */
  target: Totals;
  swapped: boolean;
};

type Ctx = {
  root: HTMLElement;
  nodes: Nodes;
  preset: Preset;
  shown: Totals;
  start: number | null;
  transition: Transition | null;
  raf: number | null;
  reduced: boolean;
  /* Playback waits for the call section (change 12): armed at mount, armed
     again by every preset switch, consumed by the section observer. */
  armed: boolean;
  callSectionVisible: boolean;
  /* A preset snapped mid-swap is queued, not discarded: the track is a
     physical position, and the page must land wherever the track rests. */
  pendingPresetId: string | null;
  audio: AudioState;
  setPresetId: (id: string) => void;
};

/* Beat crossings -> Web Audio schedules, on the rAF phase and nothing else.
   The offset (beat - t) is <= 0 by construction (we schedule the frame the
   crossing is observed), so events land at most one frame after their beat
   — inside gate 89's 50ms envelope. The haptic (B3) rides the same chime
   crossing. */
function scheduleAudio(ctx: Ctx, prevT: number, t: number) {
  const a = ctx.audio;
  if (!a.enabled || !a.actx || a.actx.state !== "running") return;
  /* Belt and braces on the gesture gate (B2): a session-restored "on" must
     stay silent until THIS page has seen a real interaction, even under a
     user agent whose autoplay policy never suspends the context. Browsers
     without navigator.userActivation still rely on the suspended-context
     check above. */
  if (
    typeof navigator !== "undefined" &&
    "userActivation" in navigator &&
    !navigator.userActivation.hasBeenActive
  )
    return;
  const actx = a.actx;
  /* Freshness bound (change 15 review, finding 1): after rAF starvation
     (hidden tab, long jank) the wall-clock phase jumps and every beat in
     the gap would fire as one late blast — a beat more than 250ms stale is
     dropped instead. The normal one-frame-late path (~16ms) is untouched. */
  const crossed = (beat: number) => prevT < beat && t >= beat && t - beat < 0.25;
  const at = (beat: number) => actx.currentTime + Math.max(0, beat - t);
  for (const b of RING_BEATS) if (crossed(b)) playRing(actx, at(b));
  if (crossed(CHIME_AT)) {
    playChime(actx, at(CHIME_AT));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(30);
      } catch {}
    }
  }
  if (crossed(LAND_AT)) playLand(actx, at(LAND_AT));
}

function collect(root: HTMLElement): Nodes {
  const typings = new Map<number, HTMLElement>();
  root.querySelectorAll<HTMLElement>("[data-typing]").forEach((el) => {
    typings.set(Number(el.dataset.typing), el);
  });
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  return {
    rows: Array.from(root.querySelectorAll<HTMLElement>("[data-row]")),
    typings,
    delivered: q("[data-delivered]"),
    bizName: q("[data-biz-name]"),
    threadArea: q("[data-thread-area]"),
    leak: q("[data-leak-lost]"),
    controls: q("[data-controls]"),
    sceneClosed: q('[data-scene-line="closed"]'),
    sceneDialing: q('[data-scene-line="dialing"]'),
    sceneCaught: q('[data-scene-line="caught"]'),
    ledgerPanel: q("[data-ledger-panel]"),
    caughtRow0: q('[data-caught-row="0"]'),
    panelRecovered: q("[data-panel-recovered]"),
    call: q("[data-call]"),
    callStatusStem: q("[data-call-status-stem]"),
    callDots: q("[data-call-dots]"),
    callDim: q("[data-call-dim]"),
    callEnd: q("[data-call-end]"),
    banner: q("[data-banner]"),
    notifyPhone: q("[data-notify-phone]"),
    shimmer: q("[data-gold-shimmer]"),
  };
}

function paintNumbers(ctx: Ctx, lost: number, panelRecovered: number) {
  ctx.shown = { lost, panelRecovered };
  if (ctx.nodes.leak) ctx.nodes.leak.textContent = usd(lost);
  if (ctx.nodes.panelRecovered) ctx.nodes.panelRecovered.textContent = usd(panelRecovered);
}

function paintFade(ctx: Ctx, o: number) {
  const s = String(o);
  if (ctx.nodes.bizName) ctx.nodes.bizName.style.opacity = s;
  if (ctx.nodes.threadArea) ctx.nodes.threadArea.style.opacity = s;
  if (ctx.nodes.ledgerPanel) ctx.nodes.ledgerPanel.style.opacity = s;
}

/* One function, one clock. `t` is GLOBAL time (the call screen starts at 0);
   the pre-existing thread beats are thread-relative, offset by THREAD_START. */
function paintScene(ctx: Ctx, t: number) {
  const n = ctx.nodes;
  const tt = t - THREAD_START;

  /* --- The customer's outgoing call (0 .. THREAD_START) --- */
  if (n.call) {
    const callOn = t < THREAD_START;
    n.call.style.display = callOn ? "flex" : "none";
    if (callOn) {
      /* Crossfade to the thread: the call screen is opaque, so fading it out
         IS the crossfade — the thread is simply revealed beneath. */
      n.call.style.opacity = String(1 - clamp01((t - THREAD_FADE_AT) / THREAD_FADE_DUR));

      if (n.callStatusStem) {
        n.callStatusStem.textContent =
          t < CALL_RINGING_AT
            ? CALL_STEMS.calling
            : t < CALL_ENDED_AT
              ? CALL_STEMS.ringing
              : COPY.call.endedLabel;
      }
      /* The ellipsis: dot count cycles 1-2-3 every DOT_PERIOD, off the same
         rAF phase. "Call Ended" carries no dots. */
      if (n.callDots) {
        n.callDots.textContent =
          t < CALL_ENDED_AT ? ".".repeat(1 + (Math.floor(t / DOT_PERIOD) % 3)) : "";
      }

      const ep = clamp01((t - CALL_ENDED_AT) / CALL_END_FADE_DUR);
      if (n.callDim) n.callDim.style.opacity = String(0.3 * ep);
      if (n.callEnd) n.callEnd.style.opacity = String(1 - ep);

      /* The banner beat: the business's text slides down over the dead call. */
      if (n.banner) {
        const bp = t < BANNER_AT ? 0 : easeOut(clamp01((t - BANNER_AT) / BANNER_IN));
        n.banner.style.opacity = String(bp);
        n.banner.style.transform = `translateY(${(1 - bp) * -140}%)`;
      }
    }
  }

  /* --- The thread (thread-relative clock) --- */
  n.rows.forEach((row, i) => {
    const beat = BEATS[i] ?? 0;
    if (tt < beat) {
      row.style.display = "none";
      return;
    }
    row.style.display = "flex";
    const p = easeOut(clamp01((tt - beat) / BUBBLE_ENTER));
    row.style.opacity = String(p);
    row.style.transform = `translateY(${(1 - p) * BUBBLE_RISE}px)`;
  });

  TYPING.forEach((spec) => {
    const el = n.typings.get(spec.before);
    if (!el) return;
    const on = tt >= spec.at && tt < (BEATS[spec.before] ?? 0);
    el.style.display = on ? "flex" : "none";
    if (!on) return;
    el.querySelectorAll<HTMLElement>("[data-dot]").forEach((dot, d) => {
      const ph = (((tt * 1.5 - d * 0.16) % 1) + 1) % 1;
      dot.style.opacity = String(0.3 + 0.7 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2)));
    });
  });

  if (n.delivered) n.delivered.style.display = tt >= DELIVERED_AT ? "block" : "none";

  /* The owner-side caught row. It never toggles display: it always occupies
     its slot in the list (so the list's height is reserved from t=0 and never
     reflows), only opacity/transform animate as it "slides in". */
  if (n.caughtRow0) {
    const p = caughtRowProgress(tt);
    n.caughtRow0.style.opacity = String(p);
    n.caughtRow0.style.transform = `translateY(${(1 - p) * CAUGHT_ROW_RISE}px)`;
  }

  /* Replay (section 1, bottom-left) lands on the settled beat —
     CONTROLS_AT is thread-relative 5.4 == global 11.0. (The down affordance
     is the persistent rail chevron now — change 15, A3.) */
  const c = clamp01((tt - CONTROLS_AT) / CONTROLS_FADE);
  if (n.controls) {
    n.controls.style.visibility = c > 0 ? "visible" : "hidden";
    n.controls.style.opacity = String(c);
  }

  /* --- Desktop scene type (change 15, A2): line 2 crossfades on the miss
         and again when the thread begins. Same clock as everything else. --- */
  const dialingIn = easeOut(clamp01((t - SCENE_DIALING_AT) / SCENE_FADE));
  const caughtIn = easeOut(clamp01((t - SCENE_CAUGHT_AT) / SCENE_FADE));
  if (n.sceneClosed) n.sceneClosed.style.opacity = String(1 - dialingIn);
  if (n.sceneDialing) n.sceneDialing.style.opacity = String(Math.min(dialingIn, 1 - caughtIn));
  if (n.sceneCaught) n.sceneCaught.style.opacity = String(caughtIn);

  /* --- The customer's closing beat: the booking confirmation on her phone.
         (The owner's ledger-side card is a static dock now — change 12, B2 —
         the engine no longer animates it.) --- */
  const np = notifyPresence(t);
  if (n.notifyPhone) {
    n.notifyPhone.style.opacity = String(np);
    n.notifyPhone.style.transform = `translateY(${(1 - np) * -140}%)`;
  }

  /* --- One shimmer sweep when the gold count-up completes (C5c). rAF-driven,
         not a CSS loop; it never touches the figure's own color. --- */
  if (n.shimmer) {
    const sp = clamp01((t - SHIMMER_AT) / SHIMMER_DUR);
    const active = t >= SHIMMER_AT && sp < 1;
    n.shimmer.style.opacity = active ? "1" : "0";
    n.shimmer.style.transform = `translateX(${-120 + 240 * sp}%)`;
  }
}

function schedule(ctx: Ctx) {
  if (ctx.raf == null) ctx.raf = requestAnimationFrame((now) => tick(ctx, now));
}

/* Paint the armed state: scene at t=0, counters at beat zero, clock parked.
   data-t reads "0.000" and never advances until the section observer starts
   playback (gate 68 asserts exactly this). */
function park(ctx: Ctx) {
  ctx.armed = true;
  ctx.start = null;
  ctx.audio.lastT = -1;
  paintScene(ctx, 0);
  paintFade(ctx, 1);
  paintNumbers(
    ctx,
    leakAt(-THREAD_START, ctx.preset.lost),
    panelRecoveredAt(-THREAD_START, ctx.preset.recovered, ctx.preset.caught[0].amount),
  );
  ctx.root.dataset.t = "0.000";
}

function beginPlayback(ctx: Ctx) {
  if (ctx.reduced || !ctx.armed || ctx.transition) return;
  ctx.armed = false;
  ctx.start = null;
  ctx.audio.lastT = -1;
  schedule(ctx);
}

function tick(ctx: Ctx, now: number) {
  ctx.raf = null;

  const tr = ctx.transition;
  if (tr) {
    /* The transition clock is stamped from the rAF timestamp, so it shares one
       time base with playback rather than introducing a second clock. */
    if (tr.at == null) tr.at = now;
    const e = (now - tr.at) / 1000;
    const half = SWAP_FADE / 2;

    if (!tr.swapped && e >= half) {
      tr.swapped = true;
      ctx.setPresetId(tr.to.id);
    }

    if (e < SWAP_ROLL) {
      paintFade(ctx, e < half ? 1 - e / half : e < SWAP_FADE ? (e - half) / half : 1);
      const rp = easeOut(clamp01(e / SWAP_ROLL));
      paintNumbers(
        ctx,
        Math.round(tr.from.lost + (tr.target.lost - tr.from.lost) * rp),
        Math.round(tr.from.panelRecovered + (tr.target.panelRecovered - tr.from.panelRecovered) * rp),
      );
      ctx.root.dataset.t = "swap";
      schedule(ctx);
      return;
    }

    ctx.transition = null;

    /* A snap that landed mid-swap was queued, not dropped: chain straight
       into the next roll so the page lands wherever the track rests. */
    const pending = ctx.pendingPresetId;
    ctx.pendingPresetId = null;
    if (pending && pending !== tr.to.id) {
      const next = PRESETS.find((p) => p.id === pending);
      if (next) {
        ctx.transition = {
          at: null,
          from: { ...ctx.shown },
          to: next,
          target: beatZeroTotals(next),
          swapped: false,
        };
        schedule(ctx);
        return;
      }
    }

    /* Change 12: a preset switch does NOT restart playback unless the call
       section is on screen — it re-arms, and the fresh run starts when the
       user returns to section 1. */
    if (!ctx.callSectionVisible) {
      paintFade(ctx, 1);
      park(ctx);
      return;
    }
    ctx.start = now;
    ctx.audio.lastT = -1;
  }

  if (ctx.start == null) ctx.start = now;
  const t = (now - ctx.start) / 1000;
  const tt = t - THREAD_START;
  const p = ctx.preset;

  paintScene(ctx, t);
  paintFade(ctx, 1);
  paintNumbers(ctx, leakAt(tt, p.lost), panelRecoveredAt(tt, p.recovered, p.caught[0].amount));
  ctx.root.dataset.t = t.toFixed(3);

  /* Sound rides the same phase value this frame just painted with. */
  scheduleAudio(ctx, ctx.audio.lastT, t);
  ctx.audio.lastT = t;

  if (t < LOOP_UNTIL) schedule(ctx);
}

/* ------------------------------------------------------------------------- */

const settledTotals = (p: Preset): Totals => ({
  lost: p.lost,
  panelRecovered: p.recovered,
});

/* Thread-relative zero == the call screen's standing values: the leak has not
   started, the panel shows the three standing rows' partial total. */
const beatZeroTotals = (p: Preset): Totals => ({
  lost: leakAt(0, p.lost),
  panelRecovered: panelRecoveredAt(0, p.recovered, p.caught[0].amount),
});

const ghost =
  "rounded-full border border-teal px-5 py-2.5 text-[13px] font-medium text-teal-bright " +
  "transition-colors hover:bg-teal/10 outline-none " +
  "focus-visible:ring-2 focus-visible:ring-teal-bright focus-visible:ring-offset-2 focus-visible:ring-offset-abyss";

const buildQuery = (biz: string, name: string) =>
  `?biz=${encodeURIComponent(biz)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;

/* Wayfinding, not headlines (change 13, G3): kicker 12px tracked, title
   Fraunces 28px, muted, 32px inset. Below 1100px the title runs 20px — at
   28px it would sit on the section-1 phone's status row on a 390px screen. */
function SectionMark({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div data-section-mark className="pointer-events-none absolute left-8 top-8 z-20">
      {/* change 16 (B2): 0.05em tracking — the 0.3em digits read as gapped
          typography soup at 12px; the mark block is now RESERVED (sections
          pad their content >= 32px below its baseline) instead of floating
          over whatever the section put there. */}
      <p className="text-[12px] uppercase tracking-[0.05em] text-muted">{kicker}</p>
      <p className="mt-1 font-display text-[20px] leading-tight text-muted min-[1100px]:text-[28px]">{title}</p>
    </div>
  );
}

/* Section ground (change 13, G2): one radial light source per section, behind
   its primary object. Static — gate 81 asserts no animation ever rides it. */
function Glow() {
  return (
    <div
      data-glow
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2"
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in srgb, var(--color-surface) 14%, transparent), transparent)",
      }}
    />
  );
}

/* Rail glyphs (change 15, A3/B2). Hand-written SVG, no icon library. */
function ShareGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="4" cy="8" r="2.1" />
      <circle cx="12" cy="3.4" r="2.1" />
      <circle cx="12" cy="12.6" r="2.1" />
      <path d="M5.9 7L10.1 4.5M5.9 9L10.1 11.5" />
    </svg>
  );
}

function SpeakerGlyph({ on }: { on: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6v4h2.6L8.5 13V3L4.6 6H2z" fill="currentColor" stroke="none" />
      {on ? (
        <>
          <path d="M10.7 5.6a3.4 3.4 0 0 1 0 4.8" />
          <path d="M12.6 3.8a6 6 0 0 1 0 8.4" />
        </>
      ) : (
        <path d="M10.6 6.2l3.6 3.6M14.2 6.2l-3.6 3.6" />
      )}
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg
      width="18"
      height="10"
      viewBox="0 0 18 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2l7 6l7-6" />
    </svg>
  );
}

export default function Demo({
  initialPresetId,
  initialName = "",
  dates,
}: {
  initialPresetId: string;
  initialName?: string;
  /* change 17 (D2): request-time ledger dates, computed server-side. */
  dates?: LedgerDates;
}) {
  const [presetId, setPresetId] = useState(initialPresetId);
  const [share, setShare] = useState<"idle" | "copied" | "manual">("idle");
  /* nameInput is the raw field; name is the committed (debounced, trimmed)
     value that re-skins the page. SSR seeds both from &name=, so a shared
     link renders the custom name with no flash of the default. */
  const [nameInput, setNameInput] = useState(initialName);
  const [name, setName] = useState(initialName);
  /* Wayfinding state: the active section (rail dots) and the preset track's
     active panel. Driven by IntersectionObservers, not scroll math. */
  const [activeSection, setActiveSection] = useState(0);
  const [yoursPanel, setYoursPanel] = useState(() =>
    Math.max(0, PRESETS.findIndex((p) => p.id === initialPresetId)),
  );
  /* One-shot swipe cue: shown when section 3 first becomes active, dismissed
     by the first horizontal scroll or a 4s timeout. */
  const [yoursCueGone, setYoursCueGone] = useState(false);
  /* Sound (change 15, B2): off until the rail toggle's tap. Restored from
     sessionStorage in the mount effect — never under reduced motion. */
  const [soundOn, setSoundOn] = useState(false);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const bizName = name || preset.bizName;
  const shareUrl = `${SHARE_ORIGIN}/${buildQuery(preset.id, name)}`;

  const rootRef = useRef<HTMLElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const yoursTrackRef = useRef<HTMLDivElement>(null);
  const yoursPanelRef = useRef<HTMLDivElement>(null);
  const kbCleanup = useRef<(() => void) | null>(null);
  const copyTimer = useRef<number | null>(null);
  const nameTimer = useRef<number | null>(null);
  const activeSectionRef = useRef(0);
  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  /* Re-bind to the DOM whenever React swaps the preset markup. Runs before
     paint, so the incoming preset never flashes at full opacity or final totals. */
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.preset = preset;
    ctx.nodes = collect(ctx.root);

    if (ctx.reduced) {
      ctx.shown = settledTotals(preset);
      return;
    }
    if (ctx.transition?.swapped) {
      paintScene(ctx, 0);
      paintFade(ctx, 0);
      paintNumbers(ctx, ctx.shown.lost, ctx.shown.panelRecovered);
    } else if (ctx.armed && !ctx.transition) {
      /* A React commit landing only AFTER the roll already parked (a stalled
         main thread) would leave the parked numbers computed from the stale
         preset — repaint the parked frame now that ctx.preset is current
         (review lens 2, S2). */
      park(ctx);
    }
  }, [preset]);

  /* A name commit is a re-skin, not a reset: React swaps text nodes in place,
     playback's clock never moves. Re-collect in case any marked node was
     re-created. */
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.nodes = collect(ctx.root);
  }, [name]);

  /* Mount. Reduced motion means zero timers: the SSR settled state stands.
     Otherwise the clock PARKS at t=0 (change 12) — the section observer
     below starts it when the call section is >= 60% visible. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const ctx: Ctx = {
      root,
      nodes: collect(root),
      preset,
      shown: settledTotals(preset),
      start: null,
      transition: null,
      raf: null,
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      armed: false,
      callSectionVisible: false,
      pendingPresetId: null,
      audio: { actx: null, enabled: false, lastT: -1 },
      setPresetId,
    };
    ctxRef.current = ctx;

    /* Sound restore (B2): salvage:sound=1 renders the toggle ON with no new
       prompt; the AudioContext created here has NO gesture behind it, so the
       browser holds it suspended until one arrives (gate 90). Reduced motion
       never restores — the toggle stays off until tapped. */
    if (!ctx.reduced) {
      let restored = false;
      try {
        restored = window.sessionStorage.getItem("salvage:sound") === "1";
      } catch {}
      if (restored) {
        ctx.audio.enabled = true;
        setSoundOn(true);
        ensureAudioContext(ctx.audio);
      }
    }

    /* A deep-linked preset starts with section 3's track already resting on
       its panel — the track, the URL, and the rendered preset must never
       disagree, including at t=0. Instant, before the observers attach. */
    const track = yoursTrackRef.current;
    const idx = PRESETS.findIndex((p) => p.id === ctx.preset.id);
    if (track && idx > 0) track.scrollLeft = idx * track.clientWidth;

    if (ctx.reduced) {
      root.dataset.t = "settled";
      return;
    }

    /* change 17 (E1): the phone screens and the section-1 scene caption
       hold at opacity 0 until the fonts have settled, then fade in over
       200ms — nothing pops mid-glyph-swap. Reduced motion never hides
       (the branch above already returned); no-JS never hides (these
       styles are set here, client-side, not in the SSR markup). */
    const fontFade = [
      ...root.querySelectorAll<HTMLElement>("[data-phone-screen]"),
      ...root.querySelectorAll<HTMLElement>("[data-scene]"),
    ];
    /* Hide INSTANTLY (this layout effect runs before the hydration paint,
       so the SSR frame never flashes), then transition only the fade-IN. */
    fontFade.forEach((el) => {
      el.style.opacity = "0";
    });
    void document.fonts.ready.then(() => {
      fontFade.forEach((el) => {
        el.style.transition = "opacity 200ms ease";
        el.style.opacity = "1";
      });
    });

    park(ctx);

    return () => {
      if (ctx.raf != null) cancelAnimationFrame(ctx.raf);
      ctx.raf = null;
    };
    // Mount only: `preset` seeds the context here and the effect above keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncUrl = (biz: string, committedName: string) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${buildQuery(biz, committedName)}${window.location.hash}`,
    );
  };

  /* ---- pager wiring: observers + keyboard. No wheel, no touchmove, no
     scroll hijacking — native CSS snap owns every gesture (gate 65). ---- */

  /* Preset follows the section-3 track (B3): snapping a panel IS the switch. */
  const onTrackPreset = (id: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const current = ctx.transition?.to.id ?? ctx.preset.id;
    if (id === current && !ctx.pendingPresetId) return;
    const next = PRESETS.find((p) => p.id === id);
    if (!next) return;

    /* Preset switch clears the name (B2): the incoming preset's own bizName
       shows, and the URL drops &name=. */
    if (nameTimer.current != null) window.clearTimeout(nameTimer.current);
    setNameInput("");
    setName("");
    syncUrl(id, "");
    setShare("idle");

    if (ctx.reduced) {
      ctx.pendingPresetId = null;
      setPresetId(id);
      return;
    }

    /* A snap landing mid-swap retargets AFTER the current roll: the track is
       where the user put it, so the page must follow — queue, never discard
       (change 12; replaces change 11's discard policy, which belonged to
       buttons, not to a physical position). */
    if (ctx.transition) {
      ctx.pendingPresetId = id;
      return;
    }
    ctx.pendingPresetId = null;
    ctx.transition = {
      at: null,
      from: { ...ctx.shown },
      to: next,
      target: beatZeroTotals(next),
      swapped: false,
    };
    schedule(ctx);
  };
  const onTrackPresetRef = useRef(onTrackPreset);
  useLayoutEffect(() => {
    onTrackPresetRef.current = onTrackPreset;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-section]"));

    /* Active section: IntersectionObserver at threshold 0.6 (A3). The call
       section's crossing also starts (or re-starts) an armed clock (B1). */
    const sectionIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const idx = sections.indexOf(e.target as HTMLElement);
          if (idx < 0) return;
          const on = e.intersectionRatio >= 0.6;
          if (on) setActiveSection(idx);
          if (sections[idx].dataset.section === "call") {
            const ctx = ctxRef.current;
            if (ctx) {
              ctx.callSectionVisible = on;
              if (on) beginPlayback(ctx);
            }
          }
        });
      },
      { root, threshold: 0.6 },
    );
    sections.forEach((s) => sectionIO.observe(s));

    /* Active panel per track, same mechanism, root = the track. */
    const panelIOs: IntersectionObserver[] = [];
    const watchTrack = (
      track: HTMLElement | null,
      onPanel: (i: number, el: HTMLElement) => void,
    ) => {
      if (!track) return;
      const panels = Array.from(track.querySelectorAll<HTMLElement>("[data-panel]"));
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.intersectionRatio >= 0.6) {
              const i = panels.indexOf(e.target as HTMLElement);
              if (i >= 0) onPanel(i, e.target as HTMLElement);
            }
          });
        },
        { root: track, threshold: 0.6 },
      );
      panels.forEach((p) => io.observe(p));
      panelIOs.push(io);
    };
    watchTrack(yoursTrackRef.current, (i, el) => {
      setYoursPanel(i);
      const id = el.dataset.preset;
      if (id) onTrackPresetRef.current(id);
    });

    /* First horizontal scroll dismisses that track's cue. A scroll listener
       is observation, not hijacking — gate 65 bans wheel/touchmove only.
       Attached two frames LATE: the mount effect's deep-link positioning of
       the track fires an async scroll event that must not count as the
       visitor's first swipe — shared ?biz= links are exactly the audience
       the cue teaches (review lens 2, finding 2). */
    const yoursTrack = yoursTrackRef.current;
    const dismissYours = () => setYoursCueGone(true);
    let cueRaf = requestAnimationFrame(() => {
      cueRaf = requestAnimationFrame(() => {
        yoursTrack?.addEventListener("scroll", dismissYours, { once: true, passive: true });
      });
    });

    /* Sound resume-on-gesture (change 15, B2 / gate 90): a session-restored
       "on" state has a suspended context — the first real gesture resumes
       it. Observation + resume only, never scheduling. */
    const resumeAudio = () => {
      const a = ctxRef.current?.audio;
      if (a?.enabled && a.actx && a.actx.state === "suspended") void a.actx.resume();
    };
    window.addEventListener("pointerdown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);

    /* Resize (rotate) re-asserts the switcher track's resting panel: the
       browser keeps scrollLeft in PIXELS while panel widths move, and a
       resize during a smooth scroll animates on to a stale pixel target —
       stranding the track between snap points and silently switching the
       preset (review lens 2, finding 1). The authoritative preset re-snaps
       the track; same-panel IO refires are absorbed by onTrackPreset's
       guard. */
    const onResize = () => {
      const ctx = ctxRef.current;
      const track = yoursTrackRef.current;
      if (!ctx || !track) return;
      const id = ctx.pendingPresetId ?? ctx.transition?.to.id ?? ctx.preset.id;
      const i = PRESETS.findIndex((p) => p.id === id);
      if (i >= 0) track.scrollTo({ left: i * track.clientWidth, behavior: "auto" });
    };
    window.addEventListener("resize", onResize);

    /* Keyboard (A3). ArrowDown/PageDown/Space -> next section, ArrowUp/PageUp
       -> previous, ArrowLeft/Right -> the active section's track. Typing in
       the name field is never intercepted. */
    let kbdTarget: { track: HTMLElement; idx: number; at: number } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
      const idx = activeSectionRef.current;

      const goSection = (i: number) => {
        const target = sections[Math.max(0, Math.min(sections.length - 1, i))];
        if (target) target.scrollIntoView({ behavior });
      };
      const goPanelBy = (delta: number) => {
        const track = sections[idx]?.querySelector<HTMLElement>("[data-track]");
        if (!track || track.scrollWidth <= track.clientWidth + 10) return false;
        const panels = Array.from(track.querySelectorAll<HTMLElement>("[data-panel]"));
        /* A second arrow inside the smooth scroll advances from the pending
           TARGET: mid-flight scrollLeft rounds back to the origin panel and
           would swallow the keypress (review lens 2, finding 4). */
        const now = performance.now();
        const cur =
          kbdTarget && kbdTarget.track === track && now - kbdTarget.at < 800
            ? kbdTarget.idx
            : Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        const next = Math.max(0, Math.min(panels.length - 1, cur + delta));
        kbdTarget = { track, idx: next, at: now };
        panels[next]?.scrollIntoView({ behavior, block: "nearest", inline: "start" });
        return true;
      };

      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          goSection(idx + 1);
          break;
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          goSection(idx - 1);
          break;
        case "ArrowRight":
          if (goPanelBy(1)) e.preventDefault();
          break;
        case "ArrowLeft":
          if (goPanelBy(-1)) e.preventDefault();
          break;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      sectionIO.disconnect();
      panelIOs.forEach((io) => io.disconnect());
      cancelAnimationFrame(cueRaf);
      yoursTrack?.removeEventListener("scroll", dismissYours);
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /* Cue timer: the swipe cue starts its 4s dismissal when section 3 first
     becomes active. UI plumbing (React state), not an animation clock. */
  useEffect(() => {
    if (SECTIONS[activeSection]?.id === "yours" && !yoursCueGone) {
      const t = window.setTimeout(() => setYoursCueGone(true), 4000);
      return () => window.clearTimeout(t);
    }
  }, [activeSection, yoursCueGone]);

  useEffect(
    () => () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      if (nameTimer.current != null) window.clearTimeout(nameTimer.current);
      kbCleanup.current?.();
    },
    [],
  );

  /* ---- interactions ---- */

  const onNameChange = (raw: string) => {
    setNameInput(raw);
    if (nameTimer.current != null) window.clearTimeout(nameTimer.current);
    /* 150ms debounce: coalesces keystrokes into one React commit + one URL
       write. Input plumbing, not an animation clock. */
    nameTimer.current = window.setTimeout(() => {
      const clean = resolveName(raw);
      setName(clean);
      /* Prefer an in-flight swap's TARGET preset: a debounce firing during
         the half-second transition must not resurrect the outgoing preset's
         id into the URL (change 10 review lens 2, finding 4). */
      const ctx = ctxRef.current;
      syncUrl(ctx?.pendingPresetId ?? ctx?.transition?.to.id ?? ctx?.preset.id ?? presetId, clean);
    }, 150);
  };

  /* Keyboard accommodation (change 16, B5): when the software keyboard
     shrinks the visual viewport, the section-3 panel pads its bottom by the
     shortfall and scrolls ITSELF (never the pager) so the phone's contact
     header — where the typed name lands — sits at the panel's visible
     start. Event-driven UI plumbing, not an animation clock. */
  const onNameFocus = () => {
    const panel = yoursPanelRef.current;
    if (!panel) return;
    const apply = () => {
      const vv = window.visualViewport;
      const shortfall = vv ? Math.max(0, Math.round(window.innerHeight - vv.height)) : 0;
      if (shortfall <= 0) return;
      panel.style.paddingBottom = `${shortfall}px`;
      panel.style.overflowY = "auto";
      const header = panel.querySelector<HTMLElement>("[data-crop-biz]");
      if (header) {
        /* block "start", contained: scroll the panel alone — scrollIntoView
           would also drag the pager off its snap point. */
        panel.scrollTop += header.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      }
    };
    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    kbCleanup.current = () => {
      vv?.removeEventListener("resize", apply);
      panel.style.paddingBottom = "";
      panel.style.overflowY = "";
      panel.scrollTop = 0;
    };
  };

  const onNameBlur = () => {
    kbCleanup.current?.();
    kbCleanup.current = null;
  };

  const onReplay = () => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.reduced) return;
    /* A click landing inside the 500ms swap is discarded: nulling the
       transition before its half-point would cancel the un-committed
       setPresetId (change 10 review lens 2, finding 2). */
    if (ctx.transition) return;
    ctx.armed = false;
    ctx.start = null;
    ctx.audio.lastT = -1;
    schedule(ctx);
  };

  /* Sound toggle (B2): the tap IS the gesture unlock — it creates or
     resumes the AudioContext. Persisted per session. OFF is a real silencer
     (review finding 2): the master gain ramps to zero — killing a ring tail
     already in flight — and the context suspends so no hardware stays held.
     Under reduced motion the preference still toggles (the spec's "stays
     off until tapped") but no context is created: playback never runs
     there, so there is nothing to sound (review finding 4). */
  const onSoundToggle = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const next = !soundOn;
    setSoundOn(next);
    ctx.audio.enabled = next;
    try {
      window.sessionStorage.setItem("salvage:sound", next ? "1" : "0");
    } catch {}
    if (ctx.reduced) return;
    if (next) {
      const actx = ensureAudioContext(ctx.audio);
      if (actx) {
        if (sharedMasterGain) {
          sharedMasterGain.gain.cancelScheduledValues(actx.currentTime);
          sharedMasterGain.gain.setTargetAtTime(1, actx.currentTime, 0.01);
        }
        if (actx.state === "suspended") void actx.resume();
      }
    } else if (ctx.audio.actx) {
      const actx = ctx.audio.actx;
      if (sharedMasterGain) {
        sharedMasterGain.gain.cancelScheduledValues(actx.currentTime);
        sharedMasterGain.gain.setTargetAtTime(0, actx.currentTime, 0.01);
      }
      /* Suspend once the ~30ms ramp has rendered — a UI courtesy timer, not
         an audio scheduler (no sound is ever timed by it). */
      window.setTimeout(() => {
        if (!ctxRef.current?.audio.enabled && actx.state === "running") void actx.suspend();
      }, 80);
    }
  };

  const onShare = async () => {
    /* The copied link must match what the sender is about to see, not what
       React committed last: flush any pending name debounce, and resolve the
       preset from an in-flight swap's target (change 10 review lens 2). */
    let committed = name;
    if (nameTimer.current != null) {
      window.clearTimeout(nameTimer.current);
      nameTimer.current = null;
      committed = resolveName(nameInput);
      setName(committed);
    }
    const ctx = ctxRef.current;
    const bizId = ctx?.pendingPresetId ?? ctx?.transition?.to.id ?? preset.id;
    const url = `${SHARE_ORIGIN}/${buildQuery(bizId, committed)}`;
    syncUrl(bizId, committed);

    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setShare("copied");
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setShare("idle"), 2000);
    } catch {
      setShare("manual");
    }
  };

  const goSection = (i: number) => {
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelectorAll<HTMLElement>("[data-section]")[i];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* The one permitted programmatic scroll (A3). */
    target?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  const goPanel = (track: HTMLElement | null, i: number) => {
    if (!track) return;
    const panels = track.querySelectorAll<HTMLElement>("[data-panel]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panels[i]?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
      inline: "start",
    });
  };

  const pagerDot = (active: boolean) =>
    `h-2.5 w-2.5 rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-bright ${
      active ? "border-teal bg-teal" : "border-muted/40 bg-transparent"
    }`;

  /* Horizontal panel dots (change 13, G4): 8px, inactive 40%, active teal. */
  const panelDot = (active: boolean) =>
    `h-2 w-2 rounded-full transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-teal-bright ${
      active ? "bg-teal opacity-100" : "bg-muted opacity-40"
    }`;

  return (
    /* The pager (A1): the ONLY vertical scroller on the page. html/body are
       overflow:hidden; the snap properties live in globals.css. */
    <main
      ref={rootRef}
      data-demo
      data-t="settled"
      data-pager
      data-app-root
      aria-label={COPY.a11y.pager}
    >
      {/* ---- SECTION 1 — the call. The phone; at >=1100px the scene type
           sits left of it (change 15, A2), all three lines on the one clock. ---- */}
      <section data-section="call">
        <Glow />
        <SectionMark {...COPY.sections.call} />

        {/* change 16 (B1/B2): below 1100px the right padding clears the
            40px rail column (56px total) and the top padding reserves the
            section mark's block — content starts >= 32px below its
            baseline, so the phone can never ride up into the mark. */}
        <div className="relative z-10 flex h-full w-full items-center justify-center gap-16 pb-6 pl-6 pr-14 pt-[112px] min-[1100px]:p-6">
          <div data-scene className="hidden max-w-[30ch] shrink-0 min-[1100px]:block">
            <p className="font-display text-[96px] font-medium leading-none text-ink lining-nums">
              {preset.thread[0].time}
            </p>
            {/* Three stacked lines; the engine crossfades opacity on the
                miss (3.6) and the thread's first beat (5.6). SSR seeds the
                settled state — "caught" — as the no-JS floor. */}
            <div className="relative mt-5 h-[80px]">
              <p
                data-scene-line="closed"
                className="absolute inset-x-0 top-0 font-display text-[28px] italic leading-snug text-muted"
                style={{ opacity: 0 }}
              >
                {COPY.scene.closed}
              </p>
              <p
                data-scene-line="dialing"
                className="absolute inset-x-0 top-0 font-display text-[28px] italic leading-snug text-muted"
                style={{ opacity: 0 }}
              >
                {COPY.scene.dialing}
              </p>
              <p
                data-scene-line="caught"
                className="absolute inset-x-0 top-0 font-display text-[28px] italic leading-snug text-muted"
                style={{ opacity: 1 }}
              >
                {COPY.scene.caught}
              </p>
            </div>
          </div>

          <div className="w-full max-w-[390px] shrink-0">
            <Phone preset={preset} bizName={bizName} typingBefore={[2]} />
          </div>
        </div>

        {/* Replay: one ghost button, bottom-left, lands settled (engine).
            The down affordance lives on the rail now (A3). */}
        <div data-controls className="absolute bottom-6 left-5 z-20 min-[1100px]:left-10">
          <button data-replay type="button" onClick={onReplay} className={ghost}>
            {COPY.replayLabel}
          </button>
        </div>
      </section>

      {/* ---- SECTION 2 — the save. change 15 (A1): below 1100px this is the
           OWNER'S SIDE ONLY — headline, docked card, ledger; no track, no
           phone (the visitor just watched it in section 1). Desktop keeps
           change 14's contained two-up. ---- */}
      <section data-section="save">
        <Glow />
        <SectionMark {...COPY.sections.save} />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col pb-8 pl-6 pr-14 pt-[112px] min-[1100px]:px-10 min-[1100px]:pb-6 min-[1100px]:pt-6">
          <div
            data-save-grid
            className="flex min-h-0 w-full flex-1 flex-col min-[1100px]:grid min-[1100px]:grid-cols-[2fr_3fr] min-[1100px]:grid-rows-[100%] min-[1100px]:items-start min-[1100px]:gap-x-12"
          >
            <div className="min-[1100px]:flex min-[1100px]:h-full min-[1100px]:min-h-0 min-[1100px]:flex-col">
              <header data-headline className="shrink-0">
                {/* change 14: 30px on desktop — at 44px the h1 runs four
                    lines in the 40% column and the >=340px phone cannot be
                    contained (availH = 852 - headline). */}
                {/* change 16 (B6): 26px at 390 — 32px ran four lines in the
                    rail-guttered column and pushed the ledger's last line
                    under the fold (gate 98 holds it at <= 3 lines; 28px
                    still wrapped to four in the 310px column). */}
                <h1 className="max-w-3xl font-display font-medium leading-[1.12] text-ink text-[26px] min-[1100px]:text-[30px]">
                  {COPY.headline}
                </h1>
                {/* Mobile keeps the sub here; on desktop it lives in the
                    right column (change 14 — see data-save-stack below). */}
                <p data-sub className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted min-[1100px]:hidden">
                  {COPY.sub}
                </p>
              </header>

              {/* The settled phone — DESKTOP ONLY (change 15, A1). Static
                  instance, top-anchored thread, screenshot-scaled to stay
                  fully contained (change 14; gates 30/34/74/83). */}
              <div
                data-save-phone-fit
                className="mt-0 hidden w-full max-w-[390px] min-[1100px]:block min-[1100px]:min-h-0 min-[1100px]:flex-1"
              >
                <Phone preset={preset} bizName={bizName} variant="static" />
              </div>
            </div>

            {/* No justify-center: auto margins center the stack when it fits
                and clamp to the reachable top edge when it doesn't (change 12
                review, lens 1 finding 1). */}
            {/* change 16 (B3): below 1100px this column is the query
                container the stack zooms against — the ladder of fixed zoom
                steps is gone; the stack fits whatever height the headline
                leaves. */}
            <div data-save-fit className="mt-4 flex min-h-0 flex-1 flex-col min-[1100px]:mt-0 min-[1100px]:h-full">
              <div data-save-stack className="relative mx-auto my-auto w-full min-[1100px]:my-0">
                {/* The sub-headline, desktop only (change 14): moved out of
                    the left column so the phone's height budget closes at a
                    >=340px width. Gate 33 accepts whichever [data-sub] is
                    visible. */}
                <p data-sub className="mb-3 hidden text-[16px] leading-relaxed text-muted min-[1100px]:block">
                  {COPY.sub}
                </p>
                {/* The owner card: DOCKED statically in flow, 12px above the
                    panel at every width. */}
                <div data-notify-ledger className="z-30 mx-auto mb-3 w-[min(92%,440px)]">
                  <NotifyCard bizName={bizName} entry={preset.caught[0]} />
                </div>
                <div data-ledger-panel className="w-full">
                  <Ledger preset={preset} bizName={bizName} dates={dates} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Share fallback (clipboard unavailable): floats beside the rail,
            which carries the Share control itself now (A3). */}
        {share === "manual" && (
          <input
            data-share-fallback
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={COPY.shareLabel}
            className="fixed right-16 top-1/2 z-40 w-[min(70vw,320px)] -translate-y-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal-bright min-[1100px]:right-20"
          />
        )}
      </section>

      {/* ---- SECTION 3 — make it yours (change 15, A4): ONE live-skin
           device (the active preset's), full and contained on desktop,
           bottom-anchored with a deliberate ~55% bleed on mobile. The track
           carries label + tiles per preset and stays the page-wide
           switcher; dots + cue sit ABOVE the phone on mobile. ---- */}
      <section data-section="yours">
        <Glow />
        <SectionMark {...COPY.sections.yours} />

        <div
          ref={yoursPanelRef}
          data-yours-panel
          className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col pl-6 pr-14 pt-[112px] min-[1100px]:px-10 min-[1100px]:pb-8 min-[1100px]:pt-[124px]"
        >
          <div className="shrink-0 max-w-md min-[1100px]:max-w-[520px]">
            <label className="block">
              <span className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.name.label}</span>
              <input
                data-name-input
                type="text"
                value={nameInput}
                onChange={(e) => onNameChange(e.target.value)}
                onFocus={onNameFocus}
                onBlur={onNameBlur}
                placeholder={COPY.name.placeholder}
                maxLength={MAX_NAME_LEN}
                autoComplete="off"
                className="mt-2 block w-full border-x-0 border-b border-t-0 border-solid border-line bg-transparent pb-1.5 font-display text-[22px] text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-teal"
              />
            </label>
            <p className="mt-1.5 text-[12px] text-muted">{COPY.name.hint}</p>
          </div>

          <div className="mt-2 flex min-h-0 w-full flex-1 flex-col min-[1100px]:mt-3 min-[1100px]:grid min-[1100px]:grid-cols-2 min-[1100px]:grid-rows-[100%] min-[1100px]:items-start min-[1100px]:gap-x-12">
            {/* The live-skin phone: name lands on its contact header AND on
                thread[0]'s own mention of the business (skinThread). Mobile:
                bottom-anchored, ~55% visible, bleeding off the section. */}
            {/* change 16 (B4): mobile order is name -> label -> tiles ->
                cue band -> phone; the phone takes whatever height remains
                below the 56px cue band, anchored there and bleeding off the
                section bottom (~55% visible). Nothing may overlap the tiles
                (gate 94). */}
            <div
              data-yours-phone-fit
              className="order-3 mx-auto mt-2 min-h-0 w-full max-w-[390px] flex-1 min-[1100px]:order-none min-[1100px]:mx-0 min-[1100px]:mt-0 min-[1100px]:h-full min-[1100px]:flex-none"
            >
              <Phone preset={preset} bizName={bizName} variant="static" staticId={preset.id} skinThread />
            </div>

            {/* The switcher IS the track: label + tiles per preset. */}
            <div className="order-1 flex min-h-0 flex-col min-[1100px]:order-none min-[1100px]:h-full">
              <div ref={yoursTrackRef} data-track className="min-h-0 w-full flex-1">
                {PRESETS.map((p) => (
                  <div
                    key={p.id}
                    data-panel
                    data-preset={p.id}
                    className="flex min-h-0 flex-col justify-start min-[1100px]:px-2"
                  >
                    <p className="font-display text-[28px] font-medium leading-tight text-ink">{p.label}</p>
                    {/* Three money tiles: ticket gold, missed ink, lost muted
                        — exactly ONE gold element per panel (gates 79/82). */}
                    <div className="mt-2 grid grid-cols-2 gap-2 min-[1100px]:mt-5 min-[1100px]:grid-cols-1 min-[1100px]:gap-3">
                      <div data-tile="ticket" className="rounded-xl border border-line bg-surface p-3 min-[1100px]:p-5">
                        <span data-ticket data-tile-value className="font-display text-[28px] font-semibold text-gold lining-nums min-[1100px]:text-[56px]">
                          ${p.ticket}
                        </span>{" "}
                        <span className="text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.ticketSuffix}</span>
                      </div>
                      <div data-tile="missed" className="rounded-xl border border-line bg-surface p-3 min-[1100px]:p-5">
                        <span data-tile-value className="font-display text-[28px] font-semibold text-ink lining-nums min-[1100px]:text-[56px]">
                          {p.missedPerMonth}
                        </span>{" "}
                        <span className="text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.missedSuffix}</span>
                      </div>
                      <div data-tile="lost" className="col-span-2 rounded-xl border border-line bg-surface p-3 min-[1100px]:col-span-1 min-[1100px]:p-5">
                        <span data-tile-value className="font-display text-[28px] font-semibold text-muted lining-nums min-[1100px]:text-[56px]">
                          {usd(p.lost)}
                        </span>{" "}
                        <span className="text-[13px] text-muted min-[1100px]:text-[17px]">{COPY.yours.lostSuffix}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile: dots + cue ABOVE the phone (A4), in a fixed 56px band
                (change 16, B4) so the phone's top edge is deterministic. */}
            <div
              data-yours-cueband
              className="order-2 mt-2 flex h-14 shrink-0 flex-col items-center justify-center gap-1.5 min-[1100px]:hidden"
            >
              <p
                className={`rounded-full bg-abyss/80 px-3 py-1 text-[12px] text-muted backdrop-blur transition-opacity duration-500 ${
                  yoursCueGone ? "opacity-0" : "opacity-100"
                }`}
              >
                {COPY.cues.presets}
              </p>
              <div className="flex justify-center gap-2.5">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    data-panel-dot
                    data-active={yoursPanel === i ? "true" : "false"}
                    aria-label={`${COPY.a11y.panelDot} ${i + 1}`}
                    onClick={() => goPanel(yoursTrackRef.current, i)}
                    className={panelDot(yoursPanel === i)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Desktop: dots + cue at the section's bottom center. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-12 z-20 hidden justify-center min-[1100px]:flex">
            <p
              className={`rounded-full bg-abyss/80 px-3 py-1 text-[12px] text-muted backdrop-blur transition-opacity duration-500 ${
                yoursCueGone ? "opacity-0" : "opacity-100"
              }`}
            >
              {COPY.cues.presets}
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-6 z-20 hidden justify-center gap-2.5 min-[1100px]:flex">
            {PRESETS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                data-panel-dot
                data-active={yoursPanel === i ? "true" : "false"}
                aria-label={`${COPY.a11y.panelDot} ${i + 1}`}
                onClick={() => goPanel(yoursTrackRef.current, i)}
                className={panelDot(yoursPanel === i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ---- SECTION 4 — the math (change 13, S4): the line is the largest
           type on the page and owns the section. Numerals gold at the line's
           own size. ---- */}
      {/* change 16 (B8): section 4 stands on the SAME ground as sections
          1-3 — the surface band read as a different page bolted on. The
          border-t stays: a rule is structure, not ground. */}
      <section data-section="math" data-bottom-band className="border-t border-line">
        <Glow />
        <SectionMark {...COPY.sections.math} />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col items-center justify-center gap-10 pl-6 pr-14 text-center min-[1100px]:gap-12 min-[1100px]:px-6">
          <p data-math className="max-w-[20ch] font-display font-medium leading-[1.12] text-ink [font-size:clamp(40px,6vw,72px)]">
            {COPY.mathLead}{" "}
            <span data-math-numeral className="font-semibold text-gold lining-nums">
              {preset.missedPerMonth}
            </span>{" "}
            {COPY.mathMid}{" "}
            <span data-math-numeral className="font-semibold text-gold lining-nums">
              ${preset.ticket}
            </span>{" "}
            {COPY.mathTail}
          </p>

          {/* One row on desktop: the CTA and the since-install strip beside
              it at 18px ink (S4b) — a standing total, not a footnote. The
              dollar figure stays ink: gold here belongs to the math numerals
              alone (gates 38/45). */}
          <div className="flex flex-col items-center gap-7 min-[1100px]:flex-row min-[1100px]:gap-12">
            <div>
              <a
                href={COPY.ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-gold px-8 py-4 text-[15px] font-semibold text-abyss outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-abyss"
              >
                {COPY.ctaLabel}
              </a>
              <p className="mt-3 text-[13px] text-muted">{COPY.footNote}</p>
            </div>
            <p className="text-[18px] text-ink">
              {preset.sinceCalls} calls caught ·{" "}
              <span className="font-semibold">{usd(preset.sinceRecovered)}</span> recovered
            </p>
          </div>
        </div>

        <p className="absolute bottom-8 left-8 z-10 text-[12px] uppercase tracking-[0.3em] text-muted">
          {COPY.chrome.og.wordmark}
        </p>
      </section>

      {/* ---- The rail (change 15, A3): Share, sound, dots, next-chevron —
           persistent on the right edge in every section. ---- */}
      {/* change 16 (B1): below 1100px the rail lives inside a 40px right
          column (36px controls at right: 2px) and every section pads 56px
          right — nothing renders under it (gate 93). */}
      <div
        data-rail
        className="fixed right-0.5 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-3 min-[1100px]:right-6 min-[1100px]:gap-4"
      >
        <button
          data-share
          data-rail-share
          type="button"
          onClick={onShare}
          title={COPY.shareLabel}
          aria-label={COPY.a11y.share}
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-teal outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal-bright focus-visible:ring-offset-2 focus-visible:ring-offset-abyss min-[1100px]:h-10 min-[1100px]:w-10 ${
            share === "copied" ? "bg-teal text-abyss" : "bg-transparent text-teal-bright hover:bg-teal/10"
          }`}
        >
          <ShareGlyph />
        </button>

        <button
          data-sound-toggle
          data-on={soundOn ? "true" : "false"}
          type="button"
          onClick={onSoundToggle}
          title={soundOn ? COPY.a11y.soundOn : COPY.a11y.soundOff}
          aria-label={soundOn ? COPY.a11y.soundOn : COPY.a11y.soundOff}
          aria-pressed={soundOn}
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-teal outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal-bright focus-visible:ring-offset-2 focus-visible:ring-offset-abyss min-[1100px]:h-10 min-[1100px]:w-10 ${
            soundOn ? "bg-teal text-abyss" : "bg-transparent text-teal-bright hover:bg-teal/10"
          }`}
        >
          <SpeakerGlyph on={soundOn} />
        </button>

        <div className="my-1 flex flex-col gap-3">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              data-pager-dot
              data-active={activeSection === i ? "true" : "false"}
              aria-label={`${COPY.a11y.dot} ${i + 1}`}
              onClick={() => goSection(i)}
              className={pagerDot(activeSection === i)}
            />
          ))}
        </div>

        <button
          data-rail-next
          type="button"
          onClick={() => goSection(activeSection + 1)}
          aria-label={COPY.a11y.next}
          className={`flex h-8 w-8 items-center justify-center text-ink opacity-40 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-teal-bright ${
            activeSection >= SECTIONS.length - 1 ? "hidden" : ""
          }`}
        >
          <span className="rail-bob">
            <ChevronGlyph />
          </span>
        </button>
      </div>
    </main>
  );
}
