"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import Ledger from "@/components/Ledger";
import Phone, { NotifyCard } from "@/components/Phone";
import { COPY, MAX_NAME_LEN, META, SHARE_ORIGIN, resolveName, type Preset } from "@/lib/client.config";
import { track } from "@/lib/track";
import { type LedgerDates } from "@/lib/dates";
import { usd } from "@/lib/format";
import {
  BANNER_AT,
  BANNER_IN,
  RECEIPT_AT,
  BEATS,
  BUBBLE_ENTER,
  BUBBLE_RISE,
  CALL_END_FADE_DUR,
  CALL_ENDED_AT,
  CALL_RINGING_AT,
  CAUGHT_ROW_AT,
  CAUGHT_ROW_RISE,
  CHIME_AT,
  CONTROLS_AT,
  CONTROLS_FADE,
  DELIVERED_AT,
  DOT_PERIOD,
  FLAP_STAGGER,
  FLAP_STEP,
  LAND_AT,
  LOOP_UNTIL,
  RING_BEATS,
  RING_BURST_DUR,
  RING_DUR,
  RING_MAX_FACTOR,
  RING_MAX_OPACITY,
  SCENE_CAUGHT_AT,
  SCENE_DIALING_AT,
  SCENE_FADE,
  STAMP_IN,
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

/* change 26 (B1): the closed-form entry spring — underdamped, k=220,
   c=18, m=1 (zeta ~0.607, wd ~11.78 rad/s). Pure function of the seconds
   since the beat; snaps to exactly 1 past the 380ms settle. */
const SPRING_SETTLE = 0.38;
function springAt(t: number): number {
  if (t <= 0) return 0;
  if (t >= SPRING_SETTLE) return 1;
  const w0 = Math.sqrt(220);
  const zeta = 18 / (2 * w0);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * w0 * t);
  return 1 - decay * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
}

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
  /* change 19 (B1): arrays — the desktop scene type and the mobile caption
     share slots and beats; whichever the viewport renders, one clock. */
  sceneClock: HTMLElement | null;
  clockSeconds: HTMLElement | null;
  mathNumerals: { el: HTMLElement; final: string }[];
  sceneClosed: HTMLElement[];
  sceneDialing: HTMLElement[];
  sceneCaught: HTMLElement[];
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
  /* change 18: the sonar ring pair (SVG circles), the split-flap cells, the
     row[0] stamp, and the section-1 device height the ring radius scales
     against. */
  sonarRings: SVGCircleElement[];
  sonarH: number;
  /* change 26: row[0]'s push geometry, the wipeable slabs, and the
     settle announcers. */
  row0Inner: HTMLElement | null;
  row0H: number;
  slabs: HTMLElement[];
  announceLeak: HTMLElement | null;
  announceRecovered: HTMLElement | null;
  flapCells: { el: HTMLElement; face: HTMLElement; digit: boolean }[];
  stamp: HTMLElement | null;
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
  /* change 24 (lever 2): the full preset list — [initialPreset] until the
     JSON script tag hydrates the other three in. */
  presets: Preset[];
  setPresetId: (id: string) => void;
  /* change 20 (E1/E2): one-shot latches the engine fires on beat crossings —
     the caret bob at settle, the sound toast at t=0.5. React state writers,
     like setPresetId; never a second clock. */
  caretLatched: boolean;
  setCaretBob: (on: boolean) => void;
  /* change 26 (G5): one polite announcement per settle. */
  announced: boolean;
  toastLatched: boolean;
  fireToast: () => void;
  /* change 27 (C2): the banner unmounts 2.6s after it lands (4.7 + 2.6 =
     7.3); park/replay remount it for the next run. */
  bannerLatched: boolean;
  setBannerGone: (gone: boolean) => void;
  /* change 29: the booking-confirmation card follows the same contract —
     its slide-out completes at 13.0; the element leaves the DOM at 13.3
     (land 10.3 + 3.0). Gate 169. */
  confirmLatched: boolean;
  setConfirmGone: (gone: boolean) => void;
  /* change 30 (G1): the slab receipt mounts on the booking beat; the
     desktop clock crossfades out under it. */
  receiptLatched: boolean;
  setReceiptShown: (shown: boolean) => void;
  /* change 30 (G5): the section-4 math roll — entry-latched, ridden on the
     one rAF (the tick keeps scheduling until the roll parks). */
  mathRoll: { started: boolean; at: number | null; done: boolean };
  /* change 30 (G6): flap-step ticks, rate-limited to one per 16ms. */
  lastFlapValue: number;
  lastFlapTickAt: number;
};

/* Beat crossings -> Web Audio schedules, on the rAF phase and nothing else.
   The offset (beat - t) is <= 0 by construction (we schedule the frame the
   crossing is observed), so events land at most one frame after their beat
   — inside gate 89's 50ms envelope. The haptic (B3) rides the same chime
   crossing. */
/* change 30 (G6): one flap step = one 12ms sine at 1200Hz, gain 0.04,
   through the shared master gain. */
function playFlapTick(actx: AudioContext) {
  if (!sharedMasterGain) return;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = "sine";
  osc.frequency.value = 1200;
  g.gain.setValueAtTime(0.04, actx.currentTime);
  g.gain.linearRampToValueAtTime(0, actx.currentTime + 0.012);
  osc.connect(g);
  g.connect(sharedMasterGain);
  osc.start(actx.currentTime);
  osc.stop(actx.currentTime + 0.014);
}

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
    sceneClock: q("[data-scene-clock]"),
    clockSeconds: q("[data-clock-seconds]"),
    mathNumerals: Array.from(root.querySelectorAll<HTMLElement>("[data-math-numeral]")).map((el) => ({
      el,
      final: (el.textContent ?? "").trim(),
    })),
    sceneClosed: Array.from(root.querySelectorAll<HTMLElement>('[data-scene-line="closed"]')),
    sceneDialing: Array.from(root.querySelectorAll<HTMLElement>('[data-scene-line="dialing"]')),
    sceneCaught: Array.from(root.querySelectorAll<HTMLElement>('[data-scene-line="caught"]')),
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
    sonarRings: Array.from(root.querySelectorAll<SVGCircleElement>("[data-sonar-ring]")),
    sonarH: root.querySelector<HTMLElement>('[data-section="call"] [data-phone-device]')?.offsetHeight ?? 0,
    flapCells: Array.from(root.querySelectorAll<HTMLElement>("[data-flap]")).map((el) => ({
      el,
      face: el.querySelector<HTMLElement>("[data-flap-face]") as HTMLElement,
      digit: el.dataset.flap === "digit",
    })),
    stamp: q("[data-stamp]"),
    row0Inner: q("[data-row0-inner]"),
    row0H: (() => {
      const outer = q('[data-caught-row="0"]');
      if (!outer) return 0;
      /* Measure the natural height with any engine-set height cleared. */
      const prev = outer.style.height;
      outer.style.height = "";
      const h = outer.offsetHeight;
      outer.style.height = prev;
      return h;
    })(),
    slabs: Array.from(root.querySelectorAll<HTMLElement>("[data-accent-slab]")),
    announceLeak: q("[data-announce-leak]"),
    announceRecovered: q("[data-announce-recovered]"),
  };
}

function paintNumbers(ctx: Ctx, lost: number, panelRecovered: number) {
  ctx.shown = { lost, panelRecovered };
  /* change 18 (D2): the still-lost figure is the flap board now — its
     glyphs are written by paintFlaps off the same phase, never here. A
     build without the board (OG page) falls back to plain text. */
  if (ctx.nodes.leak && ctx.nodes.flapCells.length === 0) ctx.nodes.leak.textContent = usd(lost);
  if (ctx.nodes.panelRecovered) ctx.nodes.panelRecovered.textContent = usd(panelRecovered);
}

/* change 18 (D2): the split-flap painter. Every glyph the board shows is a
   PURE function of the clock: flap i samples the value function at its own
   80ms-quantized, 40ms-staggered time; a glyph change between consecutive
   quanta renders as a mid-flight rotateX. No timers, no stored state — a
   frame can be replayed from (clock, valueAt) alone. */
function paintFlaps(ctx: Ctx, clock: number, valueAt: (q: number) => number) {
  const cells = ctx.nodes.flapCells;
  if (cells.length === 0) return;
  const digits = cells.filter((c) => c.digit);
  const D = digits.length;
  if (D === 0) return;
  const pad = (v: number) =>
    String(Math.max(0, Math.round(v)))
      .padStart(D, "0")
      .slice(-D);
  digits.forEach((c, i) => {
    /* One COMMON 80ms grid, offset per flap by the 40ms stagger: sampled
       times are non-increasing left-to-right, so on a descending roll the
       high-order flaps always show the newer (smaller) value — a composed
       mid-flight reading can never exceed the value it rolls from (gate
       24's rule). */
    const local = clock - FLAP_STAGGER * i;
    const q = Math.floor(local / FLAP_STEP) * FLAP_STEP;
    const cur = pad(valueAt(q))[i];
    const prev = pad(valueAt(q - FLAP_STEP))[i];
    if (c.face.textContent !== cur) c.face.textContent = cur;
    if (cur !== prev && local >= 0) {
      const prog = clamp01((local - q) / FLAP_STEP);
      c.el.style.transform = `perspective(400px) rotateX(${((1 - prog) * -75).toFixed(1)}deg)`;
    } else if (c.el.style.transform) {
      c.el.style.transform = "";
    }
  });
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
    /* change 26 (B1): spring entry — scale 0.92 -> 1 with an 8px rise,
       settled exactly at 1 within 380ms (gate 153 recomputes this closed
       form from the observed phase). */
    const se = tt - beat;
    const sp = springAt(se);
    row.style.opacity = String(clamp01(se / 0.15));
    row.style.transform = `translateY(${(8 * (1 - sp)).toFixed(2)}px) scale(${(0.92 + 0.08 * sp).toFixed(4)})`;
  });

  TYPING.forEach((spec) => {
    const el = n.typings.get(spec.before);
    if (!el) return;
    const on = tt >= spec.at && tt < (BEATS[spec.before] ?? 0);
    el.style.display = on ? "flex" : "none";
    if (!on) return;
    el.querySelectorAll<HTMLElement>("[data-dot]").forEach((dot, d) => {
      const ph = (((tt * 1.5 - d * 0.12) % 1) + 1) % 1;
      dot.style.opacity = String(0.3 + 0.7 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2)));
    });
  });

  if (n.delivered) n.delivered.style.display = tt >= DELIVERED_AT ? "block" : "none";

  /* change 26 (B4): row [0] PUSHES — the outer's height grows from 0 to
     its natural height (rows 1-3 move down by exactly that height) while
     the inner slides down within the clip. No opacity animation (gate
     155); pre-insert it is geometry-hidden, not faded. */
  if (n.caughtRow0 && n.row0Inner && n.row0H > 0) {
    const p = easeOut(clamp01((tt - CAUGHT_ROW_AT) / 0.32));
    if (p >= 1) {
      n.caughtRow0.style.height = "";
      n.caughtRow0.style.visibility = "";
      n.row0Inner.style.transform = "";
    } else {
      n.caughtRow0.style.height = `${(p * n.row0H).toFixed(1)}px`;
      n.caughtRow0.style.visibility = p === 0 ? "hidden" : "";
      n.row0Inner.style.transform = `translateY(${((p - 1) * 100).toFixed(2)}%)`;
    }
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
  n.sceneClosed.forEach((el) => (el.style.opacity = String(1 - dialingIn)));
  n.sceneDialing.forEach((el) => (el.style.opacity = String(Math.min(dialingIn, 1 - caughtIn))));
  n.sceneCaught.forEach((el) => (el.style.opacity = String(caughtIn)));

  /* --- The customer's closing beat: the booking confirmation on her phone.
         (The owner's ledger-side card is a static dock now — change 12, B2 —
         the engine no longer animates it.) --- */
  const np = notifyPresence(t);
  if (n.notifyPhone) {
    n.notifyPhone.style.opacity = String(np);
    n.notifyPhone.style.transform = `translateY(${(1 - np) * -140}%)`;
  }

  /* --- The sonar rings (change 18, D1): each ring is a pure function of
         (t - birthBeat) — radius grows to RING_MAX_FACTOR x the device
         height, opacity falls from RING_MAX_OPACITY, both ease-out. Three
         beats share two circles; a beat's ring is dead long before its
         circle is needed again. --- */
  if (n.sonarRings.length === 2 && n.sonarH > 0) {
    const live: ({ r: number; o: number } | null)[] = [null, null];
    RING_BEATS.forEach((beat, bi) => {
      const e = t - beat;
      if (e >= 0 && e < RING_DUR) {
        const p = easeOut(e / RING_DUR);
        live[bi % 2] = { r: RING_MAX_FACTOR * n.sonarH * p, o: RING_MAX_OPACITY * (1 - p) };
      }
    });
    n.sonarRings.forEach((c, j) => {
      const a = live[j];
      c.setAttribute("r", a ? a.r.toFixed(1) : "0");
      c.setAttribute("opacity", a ? a.o.toFixed(3) : "0");
    });
  }

  /* --- The SALVAGED stamp (change 18, D3): lands with the row insert,
         120ms fade on the same clock. --- */
  /* change 26 (B4): the stamp lands 120ms after the slide settles.
     change 30 (G3): the HIT — scale 1.15 -> 1, rotate -10deg -> -6deg over
     180ms (quadratic ease-out so +60ms still reads > 1.05, gate 176);
     opacity lands in the first 60ms. */
  if (n.stamp) {
    const lt = tt - (CAUGHT_ROW_AT + 0.32 + 0.12);
    n.stamp.style.opacity = String(clamp01(lt / 0.06));
    if (lt >= 0.18) {
      n.stamp.style.transform = "rotate(-6deg)";
    } else {
      const hp = 1 - Math.pow(1 - clamp01(lt / 0.18), 2);
      n.stamp.style.transform = `rotate(${(-10 + 4 * hp).toFixed(2)}deg) scale(${(1.15 - 0.15 * hp).toFixed(3)})`;
    }
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
  ctx.caretLatched = false;
  ctx.setCaretBob(false);
  ctx.bannerLatched = false;
  ctx.setBannerGone(false);
  ctx.confirmLatched = false;
  ctx.setConfirmGone(false);
  ctx.receiptLatched = false;
  ctx.setReceiptShown(false);
  if (ctx.nodes.sceneClock) ctx.nodes.sceneClock.style.opacity = "1";
  if (ctx.nodes.clockSeconds) ctx.nodes.clockSeconds.textContent = ":00";
  ctx.lastFlapValue = -1;
  paintScene(ctx, 0);
  paintFade(ctx, 1);
  paintNumbers(
    ctx,
    leakAt(-THREAD_START, ctx.preset.lost),
    panelRecoveredAt(-THREAD_START, ctx.preset.recovered, ctx.preset.caught[0].amount),
  );
  paintFlaps(ctx, -THREAD_START, (q) => leakAt(q, ctx.preset.lost));
  ctx.nodes.slabs.forEach((sl) => {
    sl.style.clipPath = "";
  });
  /* change 26 (G5): announcements clear until the next settle. */
  ctx.announced = false;
  if (ctx.nodes.announceLeak) ctx.nodes.announceLeak.textContent = "";
  if (ctx.nodes.announceRecovered) ctx.nodes.announceRecovered.textContent = "";
  ctx.root.dataset.t = "0.000";
}

function beginPlayback(ctx: Ctx) {
  if (ctx.reduced || !ctx.armed || ctx.transition) return;
  ctx.armed = false;
  ctx.start = null;
  ctx.audio.lastT = -1;
  ctx.caretLatched = false;
  ctx.setCaretBob(false);
  schedule(ctx);
}

function tick(ctx: Ctx, now: number) {
  ctx.raf = null;

  /* change 30 (G5): a math roll fired while the demo is PARKED must not
     start the playback clock — paint the roll alone and return. */
  if (ctx.armed && ctx.mathRoll.started && !ctx.mathRoll.done) {
    if (ctx.mathRoll.at == null) ctx.mathRoll.at = now;
    const e = (now - ctx.mathRoll.at) / 1000;
    const p5 = easeOut(clamp01(e / 0.6));
    ctx.nodes.mathNumerals.forEach(({ el, final }) => {
      const num = Number(final.replace(/[^0-9]/g, ""));
      el.textContent = final.replace(/[\d,]+/, Math.round(num * p5).toLocaleString("en-US"));
    });
    if (e >= 0.6) {
      ctx.mathRoll.done = true;
      ctx.nodes.mathNumerals.forEach(({ el, final }) => {
        el.textContent = final;
      });
    } else {
      schedule(ctx);
    }
    return;
  }

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
      /* change 26 (A4): the slab wipes in from the left over 320ms while
         the accent surfaces crossfade (the CSS 220ms transition). */
      const wp = clamp01(e / 0.32);
      ctx.nodes.slabs.forEach((sl) => {
        sl.style.clipPath = wp >= 1 ? "" : `inset(0 ${((1 - wp) * 100).toFixed(1)}% 0 0)`;
      });
      paintFade(ctx, e < half ? 1 - e / half : e < SWAP_FADE ? (e - half) / half : 1);
      const rp = easeOut(clamp01(e / SWAP_ROLL));
      paintNumbers(
        ctx,
        Math.round(tr.from.lost + (tr.target.lost - tr.from.lost) * rp),
        Math.round(tr.from.panelRecovered + (tr.target.panelRecovered - tr.from.panelRecovered) * rp),
      );
      /* The flap roll shares the swap's own clock and value curve — the
         roll DESCENDS to the incoming preset's beat-zero (gate 24's rule),
         so no flap ever climbs first. */
      paintFlaps(ctx, e, (q) =>
        Math.round(tr.from.lost + (tr.target.lost - tr.from.lost) * easeOut(clamp01(q / SWAP_ROLL))),
      );
      ctx.root.dataset.t = "swap";
      schedule(ctx);
      return;
    }

    ctx.transition = null;
    ctx.nodes.slabs.forEach((sl) => {
      sl.style.clipPath = "";
    });

    /* A snap that landed mid-swap was queued, not dropped: chain straight
       into the next roll so the page lands wherever the track rests. */
    const pending = ctx.pendingPresetId;
    ctx.pendingPresetId = null;
    if (pending && pending !== tr.to.id) {
      const next = ctx.presets.find((p) => p.id === pending);
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
  paintFlaps(ctx, tt, (q) => leakAt(q, p.lost));
  /* change 30 (G6): one 12ms 1200Hz tick per digit-flap step, sound on,
     rate-limited across all flaps. */
  const flapNow = leakAt(tt, p.lost);
  if (
    flapNow !== ctx.lastFlapValue &&
    ctx.lastFlapValue >= 0 &&
    ctx.audio.enabled &&
    ctx.audio.actx &&
    ctx.audio.actx.state === "running" &&
    now - ctx.lastFlapTickAt >= 16
  ) {
    playFlapTick(ctx.audio.actx);
    ctx.lastFlapTickAt = now;
  }
  ctx.lastFlapValue = flapNow;
  /* change 30 (G2): the clock seconds — one step per phase-second, frozen
     at the miss beat (":03"). */
  if (ctx.nodes.clockSeconds)
    ctx.nodes.clockSeconds.textContent = ":0" + Math.min(3, Math.max(0, Math.floor(t)));
  /* change 30 (G1): the desktop clock crossfades out under the receipt. */
  if (ctx.nodes.sceneClock)
    ctx.nodes.sceneClock.style.opacity = String(1 - clamp01((t - RECEIPT_AT) / 0.4));
  if (!ctx.receiptLatched && t >= RECEIPT_AT) {
    ctx.receiptLatched = true;
    ctx.setReceiptShown(true);
  }
  ctx.root.dataset.t = t.toFixed(3);

  /* change 26 (G5): announce the settled figures ONCE, politely. */
  if (!ctx.announced && tt >= 5.5) {
    ctx.announced = true;
    if (ctx.nodes.announceLeak) ctx.nodes.announceLeak.textContent = usd(p.lost);
    if (ctx.nodes.announceRecovered) ctx.nodes.announceRecovered.textContent = usd(p.recovered);
  }

  /* change 20 (E1/E2): settle + toast latches, on the same phase. */
  if (!ctx.caretLatched && t >= 11) {
    ctx.caretLatched = true;
    ctx.setCaretBob(true);
  }
  /* change 27 (C2): the banner leaves the DOM 2.6s after its landing
     (BANNER_AT 4.4 + BANNER_IN 0.3 + 2.6). Gate 166. */
  if (!ctx.bannerLatched && t >= 7.3) {
    ctx.bannerLatched = true;
    ctx.setBannerGone(true);
  }
  /* change 29: the confirmation card leaves the DOM 3.0s after it lands
     (10.3 + 3.0; its slide-out already completed at 13.0). */
  if (!ctx.confirmLatched && t >= 13.3) {
    ctx.confirmLatched = true;
    ctx.setConfirmGone(true);
  }
  if (!ctx.toastLatched && t >= 0.5) {
    ctx.toastLatched = true;
    ctx.fireToast();
  }

  /* Sound rides the same phase value this frame just painted with. */
  scheduleAudio(ctx, ctx.audio.lastT, t);
  ctx.audio.lastT = t;

  /* change 30 (G5): the math roll — 600ms, once, on the same rAF. */
  const mr = ctx.mathRoll;
  if (mr.started && !mr.done) {
    if (mr.at == null) mr.at = now;
    const e = (now - mr.at) / 1000;
    const p5 = easeOut(clamp01(e / 0.6));
    ctx.nodes.mathNumerals.forEach(({ el, final }) => {
      const num = Number(final.replace(/[^0-9]/g, ""));
      const rolled = Math.round(num * p5);
      el.textContent = final.replace(/[\d,]+/, rolled.toLocaleString("en-US"));
    });
    if (e >= 0.6) {
      mr.done = true;
      ctx.nodes.mathNumerals.forEach(({ el, final }) => {
        el.textContent = final;
      });
    }
  }

  if (t < LOOP_UNTIL || (mr.started && !mr.done)) schedule(ctx);
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

/* change 30 (C3): the button system — PRIMARY is the accent fill. */
const btnPrimary =
  "h-9 rounded-none bg-[var(--accent,#2CC7B6)] px-3 text-[12px] font-medium text-[var(--accent-ink,#06121F)] min-[1100px]:h-11 min-[1100px]:px-5 min-[1100px]:text-[15px] " +
  "transition-opacity hover:opacity-90 outline-none " +
  "focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2";

/* change 30 (C3): SECONDARY — 1px ink stroke at 60%, ink text, hard
   corners, 44px tall. The gold CTA keeps the page's one pill; no teal
   buttons anywhere. */
const btnSecondary =
  "h-9 rounded-none border border-[rgba(233,238,244,0.6)] bg-transparent px-3 text-[12px] font-medium text-ink min-[1100px]:h-11 min-[1100px]:px-5 min-[1100px]:text-[15px] " +
  "transition-colors hover:bg-white/5 outline-none " +
  "focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2";

/* change 31 (2): ONE link treatment on the page — teal text over a 1px teal
   underline at 70%. The gold CTA pill is a button, not a link, and keeps its
   own tier; nothing else may invent a third style. */
const linkStyle =
  "text-teal-bright underline decoration-[rgba(44,199,182,0.7)] decoration-1 underline-offset-2 " +
  "outline-none focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2";

const buildQuery = (biz: string, name: string, refDjl = false) =>
  `?biz=${encodeURIComponent(biz)}${name ? `&name=${encodeURIComponent(name)}` : ""}${refDjl ? "&ref=djl" : ""}`;

/* Wayfinding, not headlines (change 13, G3): kicker 12px tracked, title
   Fraunces 28px, muted, 32px inset. Below 1100px the title runs 20px — at
   28px it would sit on the section-1 phone's status row on a 390px screen. */
/* change 18 (B5): the folio mark — "NO. 1 — THE CALL" in one 12px mono
   line, the log's page number. The ONLY uppercase-tracked element class on
   the page (gate 111); the reserve rule from change 16 (content >= 32px
   below it) stands. */
function SectionMark({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div data-section-mark className="pointer-events-none absolute left-8 top-8 z-20">
      <p data-folio data-figure data-ink className="text-[12px] uppercase tracking-[0.04em] text-muted min-[600px]:text-[13px] min-[1100px]:text-[15px]" style={{ transitionDuration: "200ms" }}>
        {kicker} — {title}
      </p>
    </div>
  );
}

/* Rail glyphs (change 15, A3/B2). Hand-written SVG, no icon library. */
function ShareGlyph() {
  /* change 30 (C1): the iOS share — open square, arrow up. 1.5px. */
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
      <path d="M5 6.2H4a1.2 1.2 0 0 0-1.2 1.2v5.4A1.2 1.2 0 0 0 4 14h8a1.2 1.2 0 0 0 1.2-1.2V7.4A1.2 1.2 0 0 0 12 6.2h-1" />
      <path d="M8 9.8V1.6M5.4 4.1L8 1.5l2.6 2.6" />
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
      {/* change 30 (C1): OUTLINE speaker at full optical size; two arcs
          when on, one 1.5px slash THROUGH it when off (review lens: the
          small cone + corner slash read as a paper-plane). */}
      <path d="M1.5 5.8v4.4h2.9L9 14.4V1.6L4.4 5.8H1.5z" />
      {on ? (
        <>
          <path d="M11 5.2a4 4 0 0 1 0 5.6" />
          <path d="M13.2 3.2a6.8 6.8 0 0 1 0 9.6" />
        </>
      ) : (
        <path d="M2.5 14L13.5 2" />
      )}
    </svg>
  );
}

function ChevronGlyph() {
  /* change 18 (A4/C6): a 1px-stroke caret, teal — engraved, not embossed. */
  return (
    <svg
      width="18"
      height="10"
      viewBox="0 0 18 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2l7 6l7-6" />
    </svg>
  );
}

export default function Demo({
  initialPreset,
  activeIndex,
  initialName = "",
  dates,
  hasPhoto = false,
  refDjl = false,
}: {
  /* change 24 (lever 2): only the requested preset arrives as props/markup;
     the other three hydrate from the #salvage-presets JSON script tag. */
  initialPreset: Preset;
  activeIndex: number;
  initialName?: string;
  /* change 17 (D2): request-time ledger dates, computed server-side. */
  dates?: LedgerDates;
  /* change 21 (B): server-checked existence of the PLACEHOLDER photo. */
  hasPhoto?: boolean;
  /* change 26 (G6): the ?ref=djl portfolio flag, server-read. */
  refDjl?: boolean;
}) {
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [presetList, setPresetList] = useState<Preset[]>([initialPreset]);
  const [share, setShare] = useState<"idle" | "copied" | "manual">("idle");
  /* nameInput is the raw field; name is the committed (debounced, trimmed)
     value that re-skins the page. SSR seeds both from &name=, so a shared
     link renders the custom name with no flash of the default. */
  const [nameInput, setNameInput] = useState(initialName);
  const [name, setName] = useState(initialName);
  /* Wayfinding state: the active section (rail dots) and the preset track's
     active panel. Driven by IntersectionObservers, not scroll math. */
  const [activeSection, setActiveSection] = useState(0);
  const [yoursPanel, setYoursPanel] = useState(activeIndex);
  /* One-shot swipe cue: shown when section 3 first becomes active, dismissed
     by the first horizontal scroll or a 4s timeout. */
  const [yoursCueGone, setYoursCueGone] = useState(false);
  /* change 27 (C2): the banner's DOM presence — the engine latches it gone
     at t=7.3; park/replay flip it back. */
  const [bannerGone, setBannerGone] = useState(false);
  /* change 29: same contract for the booking-confirmation card. */
  const [confirmGone, setConfirmGone] = useState(false);
  /* change 30 (G1): the receipt mounts on the booking beat; SSR (and
     reduced motion) render it settled — park hides it for a motion run. */
  const [receiptShown, setReceiptShown] = useState(true);
  /* Sound (change 15, B2): off until the rail toggle's tap. Restored from
     sessionStorage in the mount effect — never under reduced motion. */
  const [soundOn, setSoundOn] = useState(false);
  /* change 20 (E1/E2): the caret bobs only once a section settles; the
     sound toast shows once per session at t=0.5. */
  const [caretBob, setCaretBob] = useState(false);
  const [toastOn, setToastOn] = useState(false);
  /* change 26 (B2/B3/B5): section-entry reveals — armed client-side only
     (SSR never hides), latched per section, skipped under reduced motion. */
  const [fxReady, setFxReady] = useState(false);
  const [entered, setEntered] = useState<boolean[]>([true, false, false, false]);

  const preset = presetList.find((p) => p.id === presetId) ?? presetList[0];
  const bizName = name || preset.bizName;
  /* change 26 (E3): the section-3 phone mirrors keystrokes INSTANTLY —
     display-only; the debounced `name` still drives everything else. */
  const liveName = resolveName(nameInput) || bizName;
  const shareUrl = `${SHARE_ORIGIN}/${buildQuery(preset.id, name, refDjl)}`;

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

  /* change 21 (D): section_reached fires on every user-driven section
     change — never for the section the page mounted on. */
  const trackedSection = useRef(0);
  useEffect(() => {
    if (activeSection === trackedSection.current) return;
    trackedSection.current = activeSection;
    track("section_reached", { section: activeSection + 1 });
  }, [activeSection]);

  /* change 24 (lever 2): pull the other three presets out of the JSON
     script tag on mount — SSR and the first client render agree on ONE
     panel; the track fills before paint of the second commit. */
  useLayoutEffect(() => {
    try {
      const el = document.getElementById("salvage-presets");
      if (!el?.textContent) return;
      const others = JSON.parse(el.textContent) as Preset[];
      if (!Array.isArray(others) || others.length === 0) return;
      const full = [...others];
      full.splice(Math.min(activeIndex, full.length), 0, initialPreset);
      setPresetList(full);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The engine and the deep-linked track both need the FULL list: sync ctx,
     then re-assert the resting panel (the change-12 deep-link contract,
     moved here from mount — at mount the track had one panel). */
  const positionedRef = useRef(false);
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (ctx) ctx.presets = presetList;
    if (positionedRef.current || presetList.length < 2) return;
    positionedRef.current = true;
    const track = yoursTrackRef.current;
    const idx = presetList.findIndex((p) => p.id === presetId);
    if (track && idx > 0) track.scrollLeft = idx * track.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetList]);

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
      /* The re-rendered flap board arrives showing the incoming preset's
         SETTLED glyphs — repaint it at the mid-roll value before this
         commit ever reaches the screen. */
      paintFlaps(ctx, 0, () => ctx.shown.lost);
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
  const nameFlashArmed = useRef(false);
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.nodes = collect(ctx.root);
    /* change 30 (G4): the section-3 contact header flashes accent 40% -> 0
       over 300ms when a typed name lands. Event-driven UI (same sanction as
       the fonts fade); never under reduced motion; never on mount. */
    if (nameFlashArmed.current && !ctx.reduced) {
      const hdr = ctx.root.querySelector<HTMLElement>('[data-section="yours"] [data-phone-header]');
      hdr?.animate(
        [
          { backgroundColor: "color-mix(in srgb, var(--accent, #2CC7B6) 40%, var(--color-surface-2))" },
          { backgroundColor: "var(--color-surface-2)" },
        ],
        { duration: 300, easing: "ease-out" },
      );
    }
    nameFlashArmed.current = true;
  }, [name]);

  /* change 27 (C2) / change 29: the banner and the confirmation card mount
     and unmount mid-run — re-collect so the engine never paints a detached
     node and always finds a fresh one. */
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.nodes = collect(ctx.root);
  }, [bannerGone, confirmGone, receiptShown]);

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
      presets: [initialPreset],
      setPresetId,
      caretLatched: false,
      setCaretBob,
      announced: false,
      toastLatched: false,
      bannerLatched: false,
      setBannerGone,
      confirmLatched: false,
      setConfirmGone,
      receiptLatched: false,
      setReceiptShown,
      mathRoll: { started: false, at: null, done: false },
      lastFlapValue: -1,
      lastFlapTickAt: 0,
      fireToast: () => {
        let seen = false;
        try {
          seen = window.sessionStorage.getItem("salvage:toast") === "1";
        } catch {}
        if (seen) return;
        try {
          window.sessionStorage.setItem("salvage:toast", "1");
        } catch {}
        setToastOn(true);
      },
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

    /* Deep-link track positioning moved to the presetList effect above
       (change 24): at mount the track holds only the SSR panel. */

    if (ctx.reduced) {
      root.dataset.t = "settled";
      return;
    }

    /* change 17 (E1), re-scoped by change 22: ONLY web-font text waits for
       fonts.ready — the captions, folio marks, and headline (Newsreader /
       Plex). The phone screen is the system stack and paints on the FIRST
       frame; gating it was what pushed LCP past the fonts. Reduced motion
       never hides (the branch above already returned); no-JS never hides
       (these styles are set here, client-side, not in the SSR markup). */
    const fontFade = [
      ...root.querySelectorAll<HTMLElement>("[data-scene]"),
      ...root.querySelectorAll<HTMLElement>("[data-scene-mobile]"),
      /* change 26 (B5): only section 1's folio rides the fonts fade — the
         others ink in on their section's first entry. */
      ...root.querySelectorAll<HTMLElement>('[data-section="call"] [data-section-mark]'),
      ...root.querySelectorAll<HTMLElement>("h1"),
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

    /* change 26 (B2/B3): arm the entry reveals (client-only, motion-only)
       and hand each save-section ink element its stagger slot — DOM order
       is the visual order (column heads precede rows). */
    setFxReady(true);
    /* A custom property, NOT transition-delay: a bare inline delay rides the
       default transition-property:all and defers EVERY style change (the
       pending->hidden flip included) by up to 1.2s. Only the "run" rule
       consumes the var. */
    root.querySelectorAll<HTMLElement>('[data-section="save"] [data-ink]').forEach((el, i) => {
      el.style.setProperty("--ink-delay", `${700 + i * 40}ms`);
    });

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
      `${window.location.pathname}${buildQuery(biz, committedName, refDjl)}${window.location.hash}`,
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
    const next = ctxRef.current?.presets.find((p) => p.id === id);
    if (!next) return;
    track("preset_change", { preset: id });

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
          if (on) {
            setActiveSection(idx);
            setEntered((prev) => (prev[idx] ? prev : prev.map((v, i) => (i === idx ? true : v))));
          }
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
      const i = (ctxRef.current?.presets ?? []).findIndex((p) => p.id === id);
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
    /* change 24: the panels (and their IntersectionObservers) exist per
       presetList render — re-attach when the JSON hydration fills the
       track. */
  }, [presetList]);

  /* Toast dismissal (change 20, E2): 3s or the first tap — UI plumbing. */
  useEffect(() => {
    if (!toastOn) return;
    const t = window.setTimeout(() => setToastOn(false), 3000);
    const dismiss = () => setToastOn(false);
    window.addEventListener("pointerdown", dismiss, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [toastOn]);

  /* Caret settle for sections 2-4 (change 20, E1): entry + 800ms; section 1
     hands the job to the engine's t>=11 latch (restored directly when
     returning to an already-settled run). */
  useEffect(() => {
    if (activeSection === 0) {
      const t = parseFloat(rootRef.current?.dataset.t ?? "");
      setCaretBob(Number.isFinite(t) && t >= 11);
      return;
    }
    setCaretBob(false);
    const timer = window.setTimeout(() => setCaretBob(true), 800);
    return () => window.clearTimeout(timer);
  }, [activeSection]);

  /* change 30 (G5): the math roll fires on section 4's FIRST entry —
     the entered[] latch is one-shot, so a second entry never re-rolls. */
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.reduced || !entered[3] || ctx.mathRoll.started) return;
    ctx.mathRoll.started = true;
    schedule(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

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
      track("name_typed", { hasName: clean !== "" });
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
    ctx.caretLatched = false;
    setCaretBob(false);
    ctx.bannerLatched = false;
    setBannerGone(false);
    ctx.confirmLatched = false;
    setConfirmGone(false);
    ctx.receiptLatched = false;
    setReceiptShown(false);
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
    if (next) track("sound_on");
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
      /* change 20 (E2): sound enabled while the OPEN is still playing
         (t < 3.6) restarts the run from 0 WITH sound — the rings deserve
         their audio. Later than the miss, no restart. */
      const t = parseFloat(ctx.root.dataset.t ?? "");
      if (Number.isFinite(t) && t > 0 && t < 3.6 && !ctx.armed && !ctx.transition) {
        ctx.start = null;
        ctx.audio.lastT = -1;
        ctx.caretLatched = false;
        setCaretBob(false);
        schedule(ctx);
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
    /* change 21 (C): the URL comes from SITE.domain — never location.origin,
       never the vercel host. */
    const url = `${SHARE_ORIGIN}/${buildQuery(bizId, committed, refDjl)}`;
    syncUrl(bizId, committed);

    /* change 21 (C): a coarse-pointer device with the native share sheet
       gets share(); everything else falls back to the clipboard. */
    if (window.matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: META.title, text: COPY.sub, url });
        track("share", { method: "share", preset: bizId });
      } catch {
        /* user dismissed the sheet — nothing to clean up */
      }
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      track("share", { method: "clipboard", preset: bizId });
      setShare("copied");
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setShare("idle"), 2000);
    } catch {
      track("share", { method: "manual", preset: bizId });
      setShare("manual");
    }
  };

  /* change 21 (B): the loop button — back to section 1, phase 0, preset
     untouched. The replay mechanics plus the one permitted programmatic
     scroll. */
  const onLoop = () => {
    const ctx = ctxRef.current;
    if (ctx && !ctx.reduced && !ctx.transition) {
      ctx.armed = false;
      ctx.start = null;
      ctx.audio.lastT = -1;
      ctx.caretLatched = false;
      setCaretBob(false);
      schedule(ctx);
    }
    goSection(0);
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

  /* change 31 (1): ONE dot on the page. The rail and the section-3 panel
     switcher are the same 8px teal square in the same two states (C2 idle /
     active) — one definition, aliased, so the two can never drift again. */
  const dot = (active: boolean) =>
    `h-2 w-2 rounded-[2px] border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2 ${
      active ? "border-teal bg-teal" : "border-[rgba(44,199,182,0.7)] bg-transparent"
    }`;
  const pagerDot = dot;
  const panelDot = dot;

  return (
    /* The pager (A1): the ONLY vertical scroller on the page. html/body are
       overflow:hidden; the snap properties live in globals.css. */
    <main
      ref={rootRef}
      data-demo
      data-t="settled"
      data-pager
      data-app-root
      data-preset={preset.id}
      aria-label={COPY.a11y.pager}
      style={{ "--accent": preset.accent, "--accent-soft": preset.accentSoft, "--accent-ink": preset.accentInk } as CSSProperties}
    >
      {/* ---- SECTION 1 — the call. The phone; at >=1100px the scene type
           sits left of it (change 15, A2), all three lines on the one clock. ---- */}
      <section data-section="call">
        {/* change 28 (A2): the desktop slab is a section band keyed off the
            column edge (globals positions it); the in-device slab serves
            below 1100. */}
        <div aria-hidden="true" data-accent-slab data-slab data-call-band className="absolute inset-y-0 z-0 hidden bg-[var(--accent-soft,#0F1E33)] min-[1100px]:block" />
        <SectionMark {...COPY.sections.call} />

        {/* change 16 (B1/B2): below 1100px the right padding clears the
            40px rail column (56px total) and the top padding reserves the
            section mark's block — content starts >= 32px below its
            baseline, so the phone can never ride up into the mark. */}
        {/* change 27 (B1): >=1100 a [1fr_auto_1fr] grid — the DEVICE is the
            centered column, the scene type right-aligned in the left third,
            vertically centered on the phone. */}
        <div className="relative z-10 flex h-full w-full items-center justify-center gap-16 pb-6 pl-6 pr-14 pt-[112px] min-[1100px]:mx-auto min-[1100px]:grid min-[1100px]:max-w-[1240px] min-[1100px]:grid-cols-[61fr_auto_39fr] min-[1100px]:gap-x-0 min-[1100px]:px-12 min-[1100px]:py-6">
          <div data-scene data-client-world className="relative hidden shrink-0 min-[1100px]:block min-[1100px]:justify-self-start min-[1100px]:self-center min-[1100px]:-translate-y-8">
            {/* change 30 (G1): the slab receipt — the clock crossfades out
                beneath it on the booking beat. Gold census +1 (gate 175);
                the off-viewport mount computes transparent so the census
                stays exact. */}
            {receiptShown && (
              <p
                data-receipt
                data-figure
                className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden items-center text-[120px] font-medium leading-none text-gold max-[1099.98px]:text-transparent min-[1100px]:flex"
              >
                +${preset.ticket}
              </p>
            )}
            <div data-scene-clock>
            {/* change 18 (B4): the clock is a timestamp — it runs in mono
                like every figure on the page. change 27 (A): 160px — it
                wraps at the space into a clock lockup. */}
            <p data-figure className="text-[160px] font-medium leading-none text-ink">
              {preset.thread[0].time}
              {/* change 30 (G2): phase seconds — frozen at the miss beat. */}
              <span data-clock-seconds className="mt-2 block text-[28px] leading-none text-muted">
                :00
              </span>
            </p>
            {/* Three stacked lines; the engine crossfades opacity on the
                miss (3.6) and the thread's first beat (5.6). SSR seeds the
                settled state — "caught" — as the no-JS floor. */}
            <div className="relative mt-5 h-[88px] max-w-[30ch] text-[32px]">
              <p
                data-scene-line="closed"
                className="absolute inset-x-0 top-0 font-caption text-[32px] font-normal italic leading-[36px] text-ink"
                style={{ opacity: 0 }}
              >
                {COPY.scene.closed}
              </p>
              <p
                data-scene-line="dialing"
                className="absolute inset-x-0 top-0 font-caption text-[32px] font-normal italic leading-[36px] text-ink"
                style={{ opacity: 0 }}
              >
                {COPY.scene.dialing}
              </p>
              <p
                data-scene-line="caught"
                className="absolute inset-x-0 top-0 font-caption text-[32px] font-normal italic leading-[36px] text-ink"
                style={{ opacity: 1 }}
              >
                {COPY.scene.mobile.caught.pre}
                <span style={{ color: "var(--accent, #8AA0B4)" }}>{COPY.scene.mobile.caught.em}</span>
                {COPY.scene.mobile.caught.post}
              </p>
            </div>
            </div>
          </div>

          {/* change 27 (B1): the stage column carries an explicit width — a
              shrink-wrapped grid column gives the aspect-boxed device
              nothing to size against (globals sets 82dvh * 9/19.5). */}
          <div data-call-stage className="w-full max-w-[390px] shrink-0">
            {/* change 19 (B1): the mobile caption — Newsreader italic 22px,
                centered above the phone, height reserved, riding the same
                three beats as the desktop scene type (same slots, one
                clock). SSR seeds the settled "caught" line. */}
            <div data-scene-mobile data-client-world className="relative mb-2 h-[30px] text-left min-[1100px]:hidden">
              <p
                data-scene-line="closed"
                className="absolute left-0 top-0 w-fit max-w-[145px] whitespace-nowrap font-caption text-[15px] font-normal italic leading-[30px] text-ink"
                style={{ opacity: 0 }}
              >
                {COPY.scene.mobile.calls}
              </p>
              <p
                data-scene-line="dialing"
                className="absolute left-0 top-0 w-fit max-w-[145px] whitespace-nowrap font-caption text-[15px] font-normal italic leading-[30px] text-ink"
                style={{ opacity: 0 }}
              >
                {COPY.scene.mobile.nobody}
              </p>
              <p
                data-scene-line="caught"
                className="absolute left-0 top-0 w-fit max-w-[145px] whitespace-nowrap font-caption text-[15px] font-normal italic leading-[30px] text-ink"
                style={{ opacity: 1 }}
              >
                {COPY.scene.mobile.caught.pre}
                <span style={{ color: "var(--accent, #8AA0B4)" }}>{COPY.scene.mobile.caught.em}</span>
                {COPY.scene.mobile.caught.post}
              </p>
            </div>
            <div className="relative">
              <Phone preset={preset} bizName={bizName} typingBefore={[2]} slab sonar showBanner={!bannerGone} showConfirm={!confirmGone} />
              {/* change 30 (G1): the mobile receipt — 72px over the device,
                  spine-left, vertically centered on it. */}
              {receiptShown && (
                <p
                  data-receipt-m
                  data-figure
                  className="pointer-events-none absolute inset-0 z-30 flex items-center justify-start text-[72px] font-medium leading-none text-gold [text-shadow:0_0_3px_rgba(6,11,20,0.85),0_2px_18px_rgba(6,11,20,0.9)] min-[1100px]:hidden min-[1100px]:text-transparent"
                >
                  +${preset.ticket}
                </p>
              )}
            </div>
            {/* change 26 (C7): the settled pair — centered under the
                phone, 24px below the bezel, 12px apart. The engine lands
                them at settle. */}
            <div data-controls className="mt-2 flex flex-col items-start gap-1.5 min-[1100px]:mt-6 min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:gap-3">
              <button data-replay type="button" onClick={onReplay} className={btnSecondary}>
                {COPY.replayLabel}
              </button>
              <button data-your-side data-client-world type="button" onClick={() => goSection(1)} className={btnPrimary}>
                {COPY.yourSideLabel}
              </button>
            </div>
          </div>
          <div aria-hidden="true" className="hidden min-[1100px]:block" />
        </div>
      </section>

      {/* ---- SECTION 2 — the save. change 15 (A1): below 1100px this is the
           OWNER'S SIDE ONLY — headline, docked card, ledger; no track, no
           phone (the visitor just watched it in section 1). Desktop keeps
           change 14's contained two-up. ---- */}
      <section data-section="save" data-entry-fx={fxReady ? (entered[1] ? "run" : "pending") : undefined}>
        <SectionMark {...COPY.sections.save} />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col pb-8 pl-6 pr-14 pt-[112px] min-[1100px]:max-w-[1240px] min-[1100px]:px-12 min-[1100px]:pb-6 min-[1100px]:pt-[84px]">
          <div
            data-save-grid
            className="flex min-h-0 w-full flex-1 flex-col min-[1100px]:grid min-[1100px]:grid-cols-[42fr_58fr] min-[1100px]:grid-rows-[auto_minmax(0,1fr)] min-[1100px]:items-start min-[1100px]:gap-x-12"
          >
              {/* change 26 (D1): the headline lives in the LEDGER's column
                  on desktop — one left edge for headline, sub, note, card,
                  and table; the phone owns the left column alone. */}
              <header data-headline className="shrink-0 min-[1100px]:col-start-1 min-[1100px]:row-start-1">
                {/* change 14: 30px on desktop — at 44px the h1 runs four
                    lines in the 40% column and the >=340px phone cannot be
                    contained (availH = 852 - headline). */}
                {/* change 16 (B6): 26px at 390, <= 3 lines (gate 98).
                    change 18 (B1/B6): Newsreader 500, -0.01em, lh 1.02;
                    desktop <= 2 lines. */}
                <h1 className="max-w-3xl font-display font-medium leading-[1.08] tracking-[-0.01em] text-ink text-[26px] min-[1100px]:text-[56px]">
                  {COPY.headline.split(/(?<=\.)\s+/).map((line, i) => (
                    <span
                      key={line}
                      data-headline-line
                      className="block"
                      style={{ "--line-delay": `${i * 90}ms` } as React.CSSProperties}
                    >
                      {line}
                    </span>
                  ))}
                </h1>
                {/* Mobile keeps the sub here; on desktop it lives in the
                    right column (change 14 — see data-save-stack below). */}
                <p data-sub data-ink className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted min-[1100px]:hidden">
                  {COPY.sub}
                </p>
                {/* change 19 (B6) / change 26 (D2): the honesty line. */}
                <p data-fictional data-ink className="mt-1 font-caption text-[12px] italic text-muted min-[1100px]:hidden">
                  {COPY.fictionalNote}
                </p>
              </header>

              {/* The settled phone — DESKTOP ONLY (change 15, A1). Static
                  instance, top-anchored thread, screenshot-scaled to stay
                  fully contained (change 14; gates 30/34/74/83). */}
              <div
                data-save-phone-fit
                className="mt-0 hidden w-full max-w-[390px] min-[1100px]:col-start-1 min-[1100px]:row-start-2 min-[1100px]:block min-[1100px]:h-full min-[1100px]:min-h-0 min-[1100px]:pt-4"
              >
                <Phone preset={preset} bizName={bizName} variant="static" />
              </div>

            {/* No justify-center: auto margins center the stack when it fits
                and clamp to the reachable top edge when it doesn't (change 12
                review, lens 1 finding 1). */}
            {/* change 16 (B3): below 1100px this column is the query
                container the stack zooms against — the ladder of fixed zoom
                steps is gone; the stack fits whatever height the headline
                leaves. */}
            <div data-save-fit className="mt-4 flex min-h-0 flex-1 flex-col min-[1100px]:col-start-2 min-[1100px]:row-start-1 min-[1100px]:row-span-2 min-[1100px]:mt-0 min-[1100px]:h-full">
              <div data-save-stack className="relative mx-auto my-auto w-full min-[1100px]:my-0">
                {/* The sub-headline, desktop only (change 14): moved out of
                    the left column so the phone's height budget closes at a
                    >=340px width. Gate 33 accepts whichever [data-sub] is
                    visible. */}
                <p data-sub data-ink className="hidden text-[17px] leading-relaxed text-muted min-[1100px]:block">
                  {COPY.sub}
                </p>
                <p data-fictional data-ink className="mb-3 mt-0.5 hidden font-caption text-[12px] italic text-muted min-[1100px]:block">
                  {COPY.fictionalNote}
                </p>
                {/* The owner card: DOCKED statically in flow, 12px above the
                    panel at every width. */}
                <div data-notify-ledger data-ink className="z-30 mb-2 w-full">
                  <NotifyCard bizName={bizName} entry={preset.caught[0]} />
                </div>
                {/* change 27 (B2): >=1100 the ledger is an app on a TABLET —
                    a 10px aluminum frame at a 28px radius, specular light
                    falling from the top-left, the panel as its screen. The
                    frame sits a step above the abyss so it reads at 1x. */}
                <div data-ledger-panel className="w-full">
                  <div
                    data-ledger-bezel
                    className="relative min-[1100px]:rounded-[28px] min-[1100px]:border min-[1100px]:border-line/70 min-[1100px]:bg-[#111D30] min-[1100px]:p-[10px] min-[1100px]:shadow-[0_40px_60px_rgba(0,0,0,0.35),0_4px_6px_rgba(0,0,0,0.6)]"
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 hidden rounded-[28px] min-[1100px]:block"
                      style={{
                        background:
                          "linear-gradient(133deg, rgba(233,238,244,0.22), rgba(233,238,244,0.05) 24%, transparent 52%)",
                      }}
                    />
                    <div className="relative min-[1100px]:rounded-[19px] min-[1100px]:bg-abyss min-[1100px]:px-6 min-[1100px]:py-5">
                      <Ledger preset={preset} bizName={bizName} dates={dates} />
                    </div>
                  </div>
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
      <section data-section="yours" data-entry-fx={fxReady ? (entered[2] ? "run" : "pending") : undefined}>
        {/* change 26 (A3): the slab is a 40% band at the section's far
            left — labels sit on it, rules cross it, figures clear it. */}
        <div
          aria-hidden="true"
          data-accent-slab
          data-slab
          className="absolute inset-y-0 left-0 z-0 w-2/5 bg-[var(--accent-soft,#0F1E33)] max-[1099.98px]:w-[244px]"
        />
        <SectionMark {...COPY.sections.yours} />

        <div
          ref={yoursPanelRef}
          data-yours-panel
          className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col pl-6 pr-14 pt-[112px] min-[1100px]:grid min-[1100px]:max-w-[1240px] min-[1100px]:grid-cols-2 min-[1100px]:grid-rows-[auto_minmax(0,1fr)] min-[1100px]:gap-x-12 min-[1100px]:px-12 min-[1100px]:pb-8 min-[1100px]:pt-[124px]"
        >
          <div className="max-w-[200px] shrink-0 min-[600px]:max-w-md min-[1100px]:col-start-1 min-[1100px]:row-start-1 min-[1100px]:max-w-[400px]">
            <label className="block">
              <span data-name-label className="text-[13px] text-muted">{COPY.name.label}</span>
              {/* change 26 (E3/E4): pencil glyph before the placeholder;
                  the placeholder IS the active preset's name (ink; italic
                  secondary for "Something else"); secondary underline at
                  rest, teal underline + caret on focus. */}
              <span className="relative block">
                {!nameInput && (
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-muted"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {/* change 31 (3): hand-drawn chisel-tip pencil — a flat
                        butt and an explicit ferrule band, squared off away
                        from the round-capped icon-library silhouette. */}
                    <path d="M2.2 11.9L2.9 9.1l6.4-6.4 2.1 2.1-6.4 6.4z" />
                    <path d="M7.9 4.1l2.1 2.1" />
                  </svg>
                )}
                <input
                  data-name-input
                  type="text"
                  value={nameInput}
                  onChange={(e) => onNameChange(e.target.value)}
                  onFocus={onNameFocus}
                  onBlur={onNameBlur}
                  placeholder={preset.bizName}
                  maxLength={MAX_NAME_LEN}
                  autoComplete="off"
                  className={`mt-2 block w-full border-x-0 border-b border-t-0 border-solid border-muted bg-transparent pb-1.5 font-display font-medium text-[19px] text-ink caret-teal outline-none transition-colors focus:border-teal focus-visible:outline-none min-[600px]:text-[22px] ${
                    nameInput ? "" : "pl-5"
                  } ${preset.id === "other" ? "placeholder:font-normal placeholder:italic placeholder:text-muted" : "placeholder:text-ink"}`}
                />
              </span>
            </label>
            <p data-name-hint className="mt-1.5 text-[12px] text-muted">{COPY.yours.hint}</p>
            {/* change 26 (E5): the rule between hint and preset label. */}
            <div className="mt-3 border-t border-line" />
          </div>

          <div className="mt-2 flex min-h-0 w-full flex-1 flex-col min-[1100px]:contents">
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
              className="order-3 mx-auto mt-2 min-h-0 w-full max-w-[390px] flex-1 min-[1100px]:order-none min-[1100px]:col-start-1 min-[1100px]:row-start-2 min-[1100px]:mx-auto min-[1100px]:mt-2 min-[1100px]:h-full min-[1100px]:min-h-0 min-[1100px]:flex-none"
            >
              <Phone
                preset={preset}
                bizName={liveName}
                variant="static"
                staticId={preset.id}
                skinThread
                headerGhost={preset.id === "other" && !nameInput.trim()}
              />
            </div>

            {/* The switcher IS the track: label + tiles per preset. */}
            <div className="order-1 flex min-h-0 flex-col min-[1100px]:order-none min-[1100px]:col-start-2 min-[1100px]:row-start-1 min-[1100px]:row-span-2 min-[1100px]:h-full">
              <div ref={yoursTrackRef} data-track className="min-h-0 w-full flex-1">
                {presetList.map((p) => (
                  <div
                    key={p.id}
                    data-panel
                    data-preset={p.id}
                    data-client-world
                    className="flex min-h-0 flex-col justify-start min-[1100px]:h-full"
                    style={{ "--accent": p.accent, "--accent-soft": p.accentSoft, "--accent-ink": p.accentInk } as CSSProperties}
                  >
                    <p data-panel-label className="w-fit font-display text-[28px] font-medium leading-[1.02] tracking-[-0.01em] text-[var(--accent,#E9EEF4)] min-[1100px]:text-[44px]">{p.label}</p>
                    {/* change 19 (B9): the fourth preset explains itself. */}
                    {p.tagline && <p data-tagline className="mt-0.5 w-fit text-[13px] text-muted">{p.tagline}</p>}
                    {/* change 26 (E1): a ruled mono head over the double
                        hairline, then labeled rows. Ticket stays the one
                        gold element per panel (gates 79/82). */}
                    <div className="mt-2 min-[1100px]:mt-5 min-[1100px]:flex min-[1100px]:min-h-0 min-[1100px]:flex-1 min-[1100px]:flex-col">
                      <p data-rows-head data-figure className="w-fit pb-1 text-[11px] tracking-[0.04em] text-muted">
                        {COPY.yours.rowsHead}
                      </p>
                      <div className="hairline2" aria-hidden="true" />
                      <div data-tile="ticket" className="flex items-baseline justify-between gap-3 border-b border-line py-2 max-[599.98px]:flex-col max-[599.98px]:items-start max-[599.98px]:gap-0 min-[1100px]:flex-1 min-[1100px]:items-center min-[1100px]:py-8">
                        <span className="whitespace-nowrap text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.rows.ticket}</span>
                        <span data-ticket data-tile-value data-figure className="font-medium leading-none text-gold text-[32px] min-[1100px]:text-[96px]">
                          ${p.ticket}
                        </span>
                      </div>
                      <div data-tile="missed" className="flex items-baseline justify-between gap-3 border-b border-line py-2 max-[599.98px]:flex-col max-[599.98px]:items-start max-[599.98px]:gap-0 min-[1100px]:flex-1 min-[1100px]:items-center min-[1100px]:py-8">
                        <span className="whitespace-nowrap text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.rows.missed}</span>
                        <span data-tile-value data-figure className="font-medium leading-none text-ink text-[32px] min-[1100px]:text-[96px]">
                          {p.missedPerMonth}
                        </span>
                      </div>
                      <div data-tile="lost" className="flex items-baseline justify-between gap-3 border-b border-line py-2 max-[599.98px]:flex-col max-[599.98px]:items-start max-[599.98px]:gap-0 min-[1100px]:flex-1 min-[1100px]:items-center min-[1100px]:py-8">
                        <span className="whitespace-nowrap text-[13px] text-muted min-[1100px]:text-[17px]">{COPY.yours.rows.lost}</span>
                        <span data-tile-value data-figure className="font-medium leading-none text-muted text-[32px] min-[1100px]:text-[96px]">
                          {usd(p.lost)}
                        </span>
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
              className="order-2 mt-2 flex h-9 shrink-0 flex-col items-start justify-center gap-1 min-[1100px]:hidden"
            >
              {/* change 26 (E2 / gate 156): the cue LEAVES the DOM when
                  dismissed — a faded ghost is still a text node. */}
              {!yoursCueGone && <p className="text-[12px] text-muted">{COPY.cues.presets}</p>}
              <div className="flex justify-center gap-2.5">
                {presetList.map((p, i) => (
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
            {/* change 19 (B7): the payoff pointer — its own line below the
                band. */}
            <p data-scroll-up className="order-2 mt-1 w-fit max-w-[200px] shrink-0 text-left text-[12px] text-muted min-[1100px]:hidden">
              {COPY.yours.scrollUp.replace("{bizName}", bizName)}
            </p>
          </div>

          {/* Desktop: dots + cue at the section's bottom center. */}
          {!yoursCueGone && (
            <div className="pointer-events-none absolute bottom-16 left-12 z-20 hidden min-[1100px]:flex">
              <p className="text-[12px] text-muted">{COPY.cues.presets}</p>
            </div>
          )}
          <div className="absolute bottom-6 left-12 z-20 hidden flex-col items-start gap-1.5 min-[1100px]:flex">
            <div className="flex justify-center gap-2.5">
              {presetList.map((p, i) => (
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
            <p data-scroll-up className="text-[12px] text-muted">
              {COPY.yours.scrollUp.replace("{bizName}", bizName)}
            </p>
          </div>
        </div>
      </section>

      {/* ---- SECTION 4 — the math (change 13, S4): the line is the largest
           type on the page and owns the section. Numerals gold at the line's
           own size. ---- */}
      {/* change 16 (B8): section 4 stands on the SAME ground as sections
          1-3 — the surface band read as a different page bolted on. The
          border-t stays: a rule is structure, not ground. */}
      <section data-section="math" data-bottom-band data-entry-fx={fxReady ? (entered[3] ? "run" : "pending") : undefined}>
        <SectionMark {...COPY.sections.math} />

        {/* change 30 (F1/F2): flowed from the folio — folio bottom + 16 ->
            the 2px rule; mobile left-aligns on the spine like desktop. */}
        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col items-start justify-start gap-8 pb-8 pl-6 pr-14 pt-[68px] text-left min-[1100px]:max-w-[1240px] min-[1100px]:items-stretch min-[1100px]:gap-14 min-[1100px]:px-12 min-[1100px]:pt-[68px]">
          {/* change 18 (C5): the math line is the ledger's TOTAL — a 2px
              rule above, 1px below, numerals in mono at display size. */}
          <div data-total className="w-full border-b border-t-2 border-line py-4">
            {name ? (
              /* change 19 (B8): the personal line — the approved template
                 split on its placeholders, the typed name in ink, numerals
                 mono gold. */
              (() => {
                const afterName = COPY.mathPersonal.split("{bizName}")[1] ?? "";
                const beforeMissed = afterName.split("{missed}")[0];
                const midPart = afterName.split("{missed}")[1]?.split("${ticket}")[0] ?? "";
                const tailPart = afterName.split("${ticket}")[1] ?? "";
                return (
                  <p data-math className="mx-0 max-w-[24ch] font-display font-medium leading-[1.08] tracking-[-0.01em] text-ink [font-size:clamp(40px,6vw,72px)] min-[1100px]:max-w-none min-[1100px]:[font-size:112px] min-[1100px]:[text-wrap:balance]">
                    <span data-math-name>{name}</span>
                    {beforeMissed}
                    <span data-math-numeral data-figure className="font-medium text-gold">
                      {preset.missedPerMonth}
                    </span>
                    {midPart}
                    <span data-math-numeral data-figure className="font-medium text-gold">
                      ${preset.ticket}
                    </span>
                    {tailPart}
                  </p>
                );
              })()
            ) : (
              <p data-math className="mx-0 max-w-[20ch] font-display font-medium leading-[1.08] tracking-[-0.01em] text-ink [font-size:clamp(40px,6vw,72px)] min-[1100px]:max-w-none min-[1100px]:[font-size:112px] min-[1100px]:[text-wrap:balance]">
                {COPY.mathLead}{" "}
                <span data-math-numeral data-figure className="font-medium text-gold">
                  {preset.missedPerMonth}
                </span>{" "}
                {COPY.mathMid}{" "}
                <span data-math-numeral data-figure className="font-medium text-gold">
                  ${preset.ticket}
                </span>{" "}
                {COPY.mathTail}
              </p>
            )}
          </div>

          {/* change 21 (B): the close. change 26 (F3) drops since-install
              from this section; (G6) the ?ref=djl portfolio variant swaps
              the conversion block for the portfolio pitch — price, sms,
              and Calendly hidden. change 27 (B4): >=1100 the close is ROW 2
              of a two-row section — CTA block left, builtBy/loop/wordmark/
              stack right-aligned right. The ?ref=djl variant runs the same
              grid. */}
          <div className="flex w-full max-w-md flex-col items-start gap-2.5 text-left min-[1100px]:grid min-[1100px]:max-w-none min-[1100px]:grid-cols-[55fr_45fr] min-[1100px]:items-start min-[1100px]:gap-x-16">
            <div data-close-left className="flex w-full flex-col items-start gap-2.5">
            {refDjl ? (
              <>
                <a
                  data-cta
                  href={COPY.portfolio.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-full bg-gold px-8 py-4 text-[15px] font-semibold text-abyss outline-none focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 min-[1100px]:px-10 min-[1100px]:py-5 min-[1100px]:text-[20px]"
                >
                  {COPY.portfolio.cta}
                </a>
                <p data-cta-sub className="text-[14px] text-muted min-[1100px]:text-[19px]">
                  {COPY.portfolio.sub}
                </p>
              </>
            ) : (
              <>
                <a
                  data-cta
                  href={COPY.contact.calendly}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("cta_calendly", { preset: preset.id })}
                  className="inline-block rounded-full bg-gold px-8 py-4 text-[15px] font-semibold text-abyss outline-none focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 min-[1100px]:px-10 min-[1100px]:py-5 min-[1100px]:text-[20px]"
                >
                  {COPY.close.ctaLabel}
                </a>
                <p data-cta-sub className="text-[14px] text-muted min-[1100px]:text-[19px]">
                  {COPY.close.ctaSub}
                </p>
                <p data-sms-line className="text-[14px] text-muted min-[1100px]:font-figures min-[1100px]:text-[17px]">
                  {COPY.close.textLead}{" "}
                  <a
                    data-sms
                    data-figure
                    href={COPY.contact.smsHref}
                    onClick={() => track("cta_sms", { preset: preset.id })}
                    className={linkStyle}
                  >
                    {COPY.contact.phone}
                  </a>
                </p>
                {/* change 30 (F4): figures mono, words sans — the approved
                    string split on its dollar figures. */}
                <p data-price-line className="text-[15px] text-ink min-[1100px]:text-[22px]">
                  {COPY.close.priceLine.split(/(\$[\d,]+)/).map((part, i) =>
                    /^\$[\d,]+$/.test(part) ? (
                      <span key={i} data-figure>{part}</span>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                </p>
              </>
            )}
            </div>

            <div data-close-rule className="mt-2 w-full border-t border-line min-[1100px]:hidden" />

            <div data-close-right className="flex w-full flex-col items-start gap-1 text-left">

            {/* change 26 (F4): 56px portrait; the name and the wordmark both
                link home. */}
            <div data-builtby className="mt-1.5 flex items-center gap-3">
              {hasPhoto ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  data-builtby-photo
                  src={COPY.contact.photo}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <span
                  data-builtby-photo
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-teal"
                >
                  <span className="font-display text-[24px] font-semibold leading-none text-abyss">S</span>
                </span>
              )}
              {/* change 30 (F3): the approved builtBy line split on the
                  name — only "Andy Jones" is the anchor. */}
              <p className="text-[13px] text-muted">
                {COPY.close.builtBy.split("Andy Jones")[0]}
                <a
                  href={COPY.portfolio.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkStyle}
                >
                  Andy Jones
                </a>
                {COPY.close.builtBy.split("Andy Jones")[1]}
              </p>
            </div>

            <button data-loop type="button" onClick={onLoop} className={`mt-1 ${btnSecondary}`}>
              {COPY.close.loopLabel}
            </button>

            <p data-wordmark className="mt-2 text-[11px] uppercase text-muted">
              <a
                href={COPY.portfolio.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`font-figures ${linkStyle}`}
              >
                {COPY.chrome.og.wordmark}
              </a>
              <span className="normal-case"> · {COPY.footNote}</span>
            </p>
            {/* change 26 (F5). */}
            <p data-stack-line data-figure className="text-[11px] text-muted">
              {COPY.close.stack}
            </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- The rail (change 15, A3): Share, sound, dots, next-chevron —
           persistent on the right edge in every section. ---- */}
      {/* change 18 (C6/A4): the share + sound controls are a TOP-RIGHT
          cluster of 28px teal-stroke squares now; the rail keeps only the
          6px square dots and the 1px caret. change 16's gutter contract
          (rail inside the 40px right column, content padded 56px) stands. */}
      <div data-top-cluster className="fixed right-1 top-2 z-40 flex gap-1.5 min-[1100px]:right-10 min-[1100px]:top-6 min-[1100px]:gap-2">
        <button
          data-share
          data-rail-share
          type="button"
          onClick={onShare}
          title={COPY.shareLabel}
          aria-label={COPY.a11y.share}
          className={`flex h-7 w-7 items-center justify-center rounded-[2px] border border-[rgba(44,199,182,0.7)] bg-transparent text-teal-bright outline-none transition-opacity min-[1100px]:h-8 min-[1100px]:w-8 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2 ${
            share === "copied" ? "opacity-100" : "opacity-90"
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
          className={`flex h-7 w-7 items-center justify-center rounded-[2px] outline-none transition-colors min-[1100px]:h-8 min-[1100px]:w-8 focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2 ${
            soundOn ? "border border-teal bg-teal text-abyss" : "border border-[rgba(44,199,182,0.7)] bg-transparent text-teal-bright hover:opacity-100"
          }`}
        >
          <SpeakerGlyph on={soundOn} />
        </button>
      </div>

      {toastOn && (
        <div
          data-sound-toast
          className="fixed right-1 top-11 z-40 text-[12px] text-muted min-[1100px]:right-10 min-[1100px]:top-16"
        >
          {COPY.a11y.tapForSound}
        </div>
      )}

      <div
        data-rail
        className="fixed right-0.5 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-3 min-[1100px]:right-10 min-[1100px]:gap-4"
      >
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
          className={`flex h-8 w-5 items-center justify-center text-teal outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-teal-bright ${
            activeSection >= SECTIONS.length - 1 ? "hidden" : ""
          }`}
        >
          <span className={caretBob ? "rail-bob" : ""}>
            <ChevronGlyph />
          </span>
        </button>
      </div>
    </main>
  );
}
