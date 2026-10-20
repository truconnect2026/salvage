"use client";

import {
  Fragment,
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import PhoneOwner, { type OwnerHandlers } from "@/components/PhoneOwner";
import { COPY, META, SHARE_ORIGIN, resolveName, type Preset } from "@/lib/client.config";
import { track } from "@/lib/track";
import { type LedgerDates } from "@/lib/dates";
import { usd } from "@/lib/format";
import { SectionMark, btnSecondary } from "@/components/demoParts";
import type { SectionProps } from "@/components/DemoSections";
import {
  ANSWER_HOLD,
  BANNER_AT,
  RECEIPT_AT,
  CALL_ENDED_AT,
  CAUGHT_ROW_AT,
  CHIME_AT,
  CONTROLS_AT,
  CONTROLS_FADE,
  FLAP_STAGGER,
  FLAP_STEP,
  LAND_AT,
  LOOP_UNTIL,
  RING_BEATS,
  RING_BURST_DUR,
  RING_DUR,
  RING_MAX_FACTOR,
  RING_MAX_OPACITY,
  RING_TIMEOUT,
  SCENE_CAUGHT_AT,
  SCENE_DIALING_AT,
  SCENE_FADE,
  SLIDE_ANSWER_AT,
  SLIDE_C,
  SLIDE_K,
  SWAP_FADE,
  SWAP_ROLL,
  THREAD_START,
  type CallPath,
  clamp01,
  easeOut,
  leakAt,
  missAt,
  panelRecoveredAt,
  secondCallAt,
  stakeAt,
  storyAt,
} from "@/lib/timeline";

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
  bizName: HTMLElement | null;
  leak: HTMLElement | null;
  controls: HTMLElement | null;
  beatWords: HTMLElement[];
  beatMoney: HTMLElement | null;
  /* change 19 (B1): arrays — the desktop scene type and the mobile caption
     share slots and beats; whichever the viewport renders, one clock. */
  sceneClock: HTMLElement | null;
  clockSeconds: HTMLElement | null;
  mathNumerals: { el: HTMLElement; final: string }[];
  sceneClosed: HTMLElement[];
  sceneDialing: HTMLElement[];
  sceneCaught: HTMLElement[];
  sceneCaughtDesk: HTMLElement[];
  ledgerPanel: HTMLElement | null;
  caughtRow0: HTMLElement | null;
  panelRecovered: HTMLElement | null;
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
  /* change 43a: the owner's phone — its three layers, the slider, the
     lock-screen notes with their natural (design-px) heights — the stake
     figures and the progress rail. */
  ownerIncoming: HTMLElement | null;
  ownerIncall: HTMLElement | null;
  ownerTimer: HTMLElement | null;
  ownerKnob: HTMLElement | null;
  ownerTrack: HTMLElement | null;
  ownerSlideLabel: HTMLElement | null;
  /* change 43a.1: the second call's face — its caller, its disabled
     slider's label — and the controls it disables. */
  ownerCaller1: HTMLElement | null;
  ownerCaller2: HTMLElement | null;
  ownerOnAJob: HTMLElement | null;
  ownerDecline: HTMLElement | null;
  ownerMax: number;
  ownerNotes: { el: HTMLElement; card: HTMLElement; kind: NoteKind; h: number }[];
  stakeValues: HTMLElement[];
  stakeBodies: HTMLElement[];
  railFills: HTMLElement[];
  railTick: HTMLElement | null;
};

type NoteKind = "missed" | "text" | "booked";
type CallHow = "" | "swipe" | "key" | "tap" | "decline" | "timeout";

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
  void loadVoices();
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

/* change 48: the voices (ring, chime, landing tone, flap tick) live in
   lib/audio.ts and load the first time sound is on — the context and its
   master gain stay here, created synchronously inside the tap (iOS only
   unlocks audio from inside the gesture itself). */
type AudioVoices = typeof import("@/lib/audio");
let voices: AudioVoices | null = null;
const loadVoices = () =>
  import("@/lib/audio").then((m) => {
    voices = m;
    return m;
  });

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
  /* change 43a: the customer's banner and confirmation card left section
     1 with her phone, and their unmount latches (changes 27/29) with them.
     The owner's call: its path, the REAL time it ended, and how. */
  call: { path: CallPath; at: number; how: CallHow };
  /* The slide-to-answer knob, in design px. Pointer handlers write x while
     dragging; the tick owns everything else (the spring, the paint). */
  slider: { x: number; v: number; drag: boolean; pid: number | null; startClient: number; startX: number; k: number };
  /* The last painted real time (and story time), and the rAF stamp the
     spring's delta is measured from. */
  lastReal: number;
  lastT: number;
  lastNow: number | null;
  /* Haptic crossings, like audio.lastT: the previous real and story times. */
  hapticReal: number;
  hapticT: number;
  /* change 43a.1: which caller Salvage caught (React state, latched by the
     engine once the answered call's in-call screen ends). */
  credit: 0 | 1;
  creditLatched: boolean;
  setCredit: (c: 0 | 1) => void;
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
/* change 43a: the rings ride the REAL clock (the phone rings six times
   unless the owner acts; a ring is never born after the call ends), the
   chime and the landing tone ride the STORY clock — the chime is the text
   going out, so an answered call has none. */
/* change 43a.1: every ring the owner's phone sounds this run, on the REAL
   clock — the first call's six (none born after it ends) and, answered,
   the second call's six, which always ring out. */
function ringBirths(ctx: Ctx): number[] {
  const c = ctx.call;
  const firstEnd = c.path === "ringing" ? Infinity : c.at;
  const out = RING_BEATS.filter((b) => b < firstEnd);
  if (c.path === "answered") {
    const s2 = secondCallAt(c.at);
    for (const b of RING_BEATS) out.push(s2 + b);
  }
  return out;
}

function scheduleAudio(ctx: Ctx, prevReal: number, real: number, prevT: number, t: number) {
  const a = ctx.audio;
  if (!a.enabled || !a.actx || a.actx.state !== "running" || !voices || !sharedMasterGain) return;
  const v = voices;
  const out = sharedMasterGain;
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
  const crossedReal = (beat: number) => prevReal < beat && real >= beat && real - beat < 0.25;
  for (const b of ringBirths(ctx)) if (crossedReal(b)) v.playRing(actx, out, actx.currentTime + Math.max(0, b - real));
  /* The chime is the text going out — after a miss, first or second. */
  if (ctx.call.path !== "ringing" && crossed(CHIME_AT)) v.playChime(actx, out, at(CHIME_AT));
  if (crossed(LAND_AT)) v.playLand(actx, out, at(LAND_AT));
}

/* change 43a: haptics — a buzz per ring, a double on the miss, a tap on the
   booking. Event-driven and independent of the sound toggle; a page the
   visitor has not touched yet is skipped (the browser would refuse it and
   log an intervention). iOS has no vibrate; nothing happens there. */
const BUZZ_RING = 300;
const BUZZ_MISSED = [60, 80, 60];
const BUZZ_BOOKED = 30;
function buzz(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if ("userActivation" in navigator && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}
function scheduleHaptics(ctx: Ctx, prevReal: number, real: number, prevT: number, t: number) {
  const crossedReal = (b: number) => prevReal < b && real >= b && real - b < 0.25;
  for (const b of ringBirths(ctx)) if (crossedReal(b)) buzz(BUZZ_RING);
  /* The second call ringing out is a miss too. */
  if (ctx.call.path === "answered" && crossedReal(missAt("answered", ctx.call.at))) buzz(BUZZ_MISSED);
  if (prevT < RECEIPT_AT && t >= RECEIPT_AT && t - RECEIPT_AT < 0.25) buzz(BUZZ_BOOKED);
}

/* The knob's travel: the track less the knob and its 4px insets. All design
   px — offsetWidth ignores the screen's scale transform. A hidden app (the
   landscape guard) measures 0; the slider re-measures on pointerdown and
   every resize re-collects. */
function measureTravel(track: HTMLElement | null, knob: HTMLElement | null) {
  return track && knob ? Math.max(1, track.offsetWidth - knob.offsetWidth - 8) : 1;
}

/* Row [0]'s natural height, measured the first time the insert needs it
   (with any engine-set height cleared for the read, then restored). */
function row0Height(n: Nodes): number {
  if (n.row0H < 0 && n.caughtRow0) {
    const prev = n.caughtRow0.style.height;
    n.caughtRow0.style.height = "";
    n.row0H = n.caughtRow0.offsetHeight;
    n.caughtRow0.style.height = prev;
  }
  return n.row0H;
}

function collect(root: HTMLElement): Nodes {
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  return {
    bizName: q("[data-biz-name]"),
    leak: q("[data-leak-lost]"),
    controls: q("[data-controls]"),
    beatWords: Array.from(root.querySelectorAll<HTMLElement>("[data-beat]")),
    beatMoney: q("[data-beat-money]"),
    sceneClock: q("[data-scene-clock]"),
    clockSeconds: q("[data-clock-seconds]"),
    mathNumerals: Array.from(root.querySelectorAll<HTMLElement>("[data-math-numeral]")).map((el) => ({
      el,
      final: (el.textContent ?? "").trim(),
    })),
    sceneClosed: Array.from(root.querySelectorAll<HTMLElement>('[data-scene-line="closed"]')),
    sceneDialing: Array.from(root.querySelectorAll<HTMLElement>('[data-scene-line="dialing"]')),
    sceneCaught: Array.from(root.querySelectorAll<HTMLElement>('[data-scene-line="caught"]')),
    /* change 36 (C2): only the DESKTOP caught line hands its slot to the
       receipt — the mobile receipt is retired, so the mobile caption has
       nothing to fade out for and must stay up. */
    sceneCaughtDesk: Array.from(
      root.querySelectorAll<HTMLElement>('[data-scene] [data-scene-line="caught"]'),
    ),
    ledgerPanel: q("[data-ledger-panel]"),
    caughtRow0: q('[data-caught-row="0"]'),
    panelRecovered: q("[data-panel-recovered]"),
    sonarRings: Array.from(root.querySelectorAll<SVGCircleElement>("[data-sonar-ring]")),
    sonarH: root.querySelector<HTMLElement>('[data-section="call"] [data-phone-device]')?.offsetHeight ?? 0,
    flapCells: Array.from(root.querySelectorAll<HTMLElement>("[data-flap]")).map((el) => ({
      el,
      face: el.querySelector<HTMLElement>("[data-flap-face]") as HTMLElement,
      digit: el.dataset.flap === "digit",
    })),
    stamp: q("[data-stamp]"),
    row0Inner: q("[data-row0-inner]"),
    /* change 48: measured LAZILY (row0Height) — section 2 is skipped by
       content-visibility while off screen, and reading its geometry here
       forced the whole section to lay out during hydration. */
    row0H: -1,
    slabs: Array.from(root.querySelectorAll<HTMLElement>("[data-accent-slab]")),
    announceLeak: q("[data-announce-leak]"),
    announceRecovered: q("[data-announce-recovered]"),
    ownerIncoming: q("[data-owner-incoming]"),
    ownerIncall: q("[data-owner-incall]"),
    ownerTimer: q("[data-owner-timer]"),
    ownerKnob: q("[data-owner-knob]"),
    ownerTrack: q("[data-owner-track]"),
    ownerSlideLabel: q("[data-owner-slide-label]"),
    ownerCaller1: q("[data-owner-caller]"),
    ownerCaller2: q("[data-owner-caller-2]"),
    ownerOnAJob: q("[data-owner-onajob]"),
    ownerDecline: q("[data-owner-decline]"),
    ownerMax: measureTravel(q("[data-owner-track]"), q("[data-owner-knob]")),
    ownerNotes: Array.from(root.querySelectorAll<HTMLElement>("[data-owner-note]")).map((el) => {
      const prev = el.style.height;
      el.style.height = "";
      const h = el.offsetHeight;
      el.style.height = prev;
      return {
        el,
        card: el.querySelector<HTMLElement>("[data-owner-note-card]") as HTMLElement,
        kind: el.dataset.ownerNote as NoteKind,
        h,
      };
    }),
    stakeValues: Array.from(root.querySelectorAll<HTMLElement>("[data-stake-value]")),
    stakeBodies: Array.from(root.querySelectorAll<HTMLElement>("[data-stake-body]")),
    railFills: Array.from(root.querySelectorAll<HTMLElement>("[data-rail-fill]")),
    railTick: q("[data-rail-tick]"),
  };
}

/* change 48: every engine write goes through these — a frame writes only
   what CHANGED. A write of an identical value still dirties style (and,
   for geometry, layout) in the browser, and the engine runs every frame:
   at 4x CPU the unconditional writes were most of a 60-250ms frame. The
   cache holds the raw string last written per element, so a value the
   browser normalises ("0.0px" reads back "0px") never reads as a change. */
const written = new WeakMap<Element, Record<string, string>>();
function put(el: HTMLElement | SVGElement | null | undefined, prop: string, v: string) {
  if (!el) return;
  let w = written.get(el);
  if (!w) {
    w = {};
    written.set(el, w);
  }
  if (w[prop] === v) return;
  w[prop] = v;
  (el.style as unknown as Record<string, string>)[prop] = v;
}
function putText(el: Element | null | undefined, v: string) {
  if (el && el.textContent !== v) el.textContent = v;
}
function putAttr(el: Element | null | undefined, name: string, v: string) {
  if (!el) return;
  let w = written.get(el);
  if (!w) {
    w = {};
    written.set(el, w);
  }
  if (w["@" + name] === v) return;
  w["@" + name] = v;
  el.setAttribute(name, v);
}

function paintNumbers(ctx: Ctx, lost: number, panelRecovered: number) {
  ctx.shown = { lost, panelRecovered };
  /* change 18 (D2): the still-lost figure is the flap board now — its
     glyphs are written by paintFlaps off the same phase, never here. A
     build without the board (OG page) falls back to plain text. */
  if (ctx.nodes.leak && ctx.nodes.flapCells.length === 0) putText(ctx.nodes.leak, usd(lost));
  if (ctx.nodes.panelRecovered) putText(ctx.nodes.panelRecovered, usd(panelRecovered));
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
    if (c.face.textContent !== cur) putText(c.face, cur);
    if (cur !== prev && local >= 0) {
      const prog = clamp01((local - q) / FLAP_STEP);
      put(c.el, "transform", `perspective(400px) rotateX(${((1 - prog) * -75).toFixed(1)}deg)`);
    } else if (c.el.style.transform) {
      put(c.el, "transform", "");
    }
  });
}

function paintFade(ctx: Ctx, o: number) {
  const s = String(o);
  if (ctx.nodes.bizName) put(ctx.nodes.bizName, "opacity", s);
  if (ctx.nodes.ledgerPanel) put(ctx.nodes.ledgerPanel, "opacity", s);
}

/* change 43a: the owner's phone, the stake and the rail. The layers and the
   slider ride the REAL clock (what the owner does happens in real time);
   the lock-screen notes and the rail ride the STORY clock, so each lands on
   its change-11 beat whichever way the call ended. An answered call never
   misses and never texts: only the booking lands. */
const NOTE_AT: Record<NoteKind, number> = { missed: CALL_ENDED_AT, text: BANNER_AT, booked: RECEIPT_AT };
const BEAT_AT = [CALL_ENDED_AT, BANNER_AT, RECEIPT_AT];
/* change 43a.1: every path ends on a miss now (the answered path's second
   call rings out), so once the first call has ended all three beats land
   — the story clock holds them back until that miss. */
const beatLands = (path: CallPath, i: number) => path !== "ringing" && i >= 0;



function paintOwner(ctx: Ctx, t: number, real: number) {
  const n = ctx.nodes;
  const c = ctx.call;
  const ringing = c.path === "ringing";

  /* change 43a.1: answered, a SECOND call comes up SECOND_GAP after the
     in-call screen and rings out — the owner is out on the first job. */
  const s2 = c.path === "answered" ? secondCallAt(c.at) : Infinity;
  const m2 = c.path === "answered" ? missAt("answered", c.at) : Infinity;
  const secondUp = real >= s2;

  /* Incoming is the top layer: up while it rings, out over 250ms when the
     call ends — revealing the in-call layer (answered) or the lock screen;
     answered, back in over 250ms for the second call and out when it
     rings out. */
  if (n.ownerIncoming) {
    const o = ringing
      ? 1
      : !secondUp
        ? 1 - clamp01((real - c.at) / 0.25)
        : real < m2
          ? clamp01((real - s2) / 0.25)
          : 1 - clamp01((real - m2) / 0.25);
    put(n.ownerIncoming, "opacity", String(o));
    put(n.ownerIncoming, "visibility", o > 0 ? "visible" : "hidden");
  }
  /* The second call's face: its caller, and a slider that cannot be used
     ("You're on a job."); Decline goes inert with it. */
  put(n.ownerCaller1, "display", secondUp ? "none" : "");
  put(n.ownerCaller2, "display", secondUp ? "" : "none");
  put(n.ownerSlideLabel, "display", secondUp ? "none" : "");
  put(n.ownerOnAJob, "display", secondUp ? "" : "none");
  put(n.ownerKnob, "opacity", secondUp ? "0.35" : "1");
  put(n.ownerDecline, "opacity", secondUp ? "0.4" : "1");
  for (const el of [n.ownerKnob, n.ownerDecline]) {
    if (!el) continue;
    if (secondUp && el.getAttribute("aria-disabled") !== "true") el.setAttribute("aria-disabled", "true");
    if (!secondUp && el.hasAttribute("aria-disabled")) el.removeAttribute("aria-disabled");
  }
  if (n.ownerIncall) {
    const e = real - c.at;
    const o = c.path !== "answered" ? 0 : e < ANSWER_HOLD ? 1 : 1 - clamp01((e - ANSWER_HOLD) / 0.3);
    put(n.ownerIncall, "opacity", String(o));
    put(n.ownerIncall, "visibility", o > 0 ? "visible" : "hidden");
    if (n.ownerTimer) {
      const sec = c.path === "answered" ? Math.min(59, Math.max(0, Math.floor(e))) : 0;
      const txt = `0:${String(sec).padStart(2, "0")}`;
      if (n.ownerTimer.textContent !== txt) putText(n.ownerTimer, txt);
    }
  }

  /* The slider: the tick owns the knob's transform (stepSlider integrates
     it). The label breathes with each ring — up over the ring's first half,
     down over its second — and fades as the knob covers it. */
  if (n.ownerKnob) {
    const x = ctx.slider.x;
    put(n.ownerKnob, "transform", `translateX(${x.toFixed(1)}px)`);
    if (n.ownerSlideLabel) {
      let pulse = 0;
      if (ringing)
        for (const b of RING_BEATS) {
          const e = real - b;
          if (e >= 0 && e < RING_BURST_DUR) pulse = Math.sin((Math.PI * e) / RING_BURST_DUR);
        }
      const cover = 1 - clamp01(x / (0.5 * n.ownerMax));
      put(n.ownerSlideLabel, "opacity", (cover * (0.55 + 0.45 * pulse)).toFixed(3));
    }
  }

  /* The lock-screen notes PUSH, newest on top: the outer box grows from 0
     to its natural height (the older notes move down by exactly that)
     while the card drops in from above. */
  n.ownerNotes.forEach((note) => {
    const e = t - NOTE_AT[note.kind];
    const lands = !ringing;
    const shown = lands && e >= 0;
    const p = shown ? easeOut(clamp01(e / 0.32)) : 0;
    if (shown && (p >= 1 || note.h <= 0)) {
      put(note.el, "height", "");
      put(note.el, "overflow", "");
      put(note.el, "visibility", "");
    } else {
      put(note.el, "overflow", "hidden");
      put(note.el, "height", `${(p * note.h).toFixed(1)}px`);
      put(note.el, "visibility", shown ? "" : "hidden");
    }
    if (note.card) {
      put(note.card, "opacity", String(lands ? clamp01(e / 0.2) : 0));
      put(note.card, "transform", p >= 1 ? "" : `translateY(${((p - 1) * 24).toFixed(1)}px) scale(${(0.96 + 0.04 * p).toFixed(3)})`);
    }
  });

  /* The stake: counts up in real time over the six rings, frozen at the
     stored figure on the miss (never above it), frozen where the answer
     caught it otherwise. */
  /* change 43a.1: ONE call's worth — the stored ticket ("Per job"). */
  const stake = usd(stakeAt(real, ctx.preset.ticket, c.path, c.at));
  n.stakeValues.forEach((el) => {
    if (el.textContent !== stake) putText(el, stake);
  });
  /* Answered, nothing was lost on THAT call — and its count stopped
     mid-climb at a figure nobody stored. The whole line leaves over 300ms
     (a computed figure never rests on screen; lost money is never gray),
     and comes back with the second call, counting from zero. */
  const stakeOn = String(
    c.path !== "answered" ? 1 : !secondUp ? 1 - clamp01((real - c.at) / 0.3) : clamp01((real - s2) / 0.3),
  );
  n.stakeBodies.forEach((el) => {
    if (el.style.opacity !== stakeOn) put(el, "opacity", stakeOn);
  });

  /* The progress rail: a segment fills in accent over 400ms on the beat it
     names; the gold tick and the money land with the booking. */
  n.railFills.forEach((el) => {
    const i = Number(el.dataset.railFill);
    const f = beatLands(c.path, i) ? easeOut(clamp01((t - BEAT_AT[i]) / 0.4)) : 0;
    put(el, "transform", `scaleX(${f.toFixed(3)})`);
  });
  n.beatWords.forEach((el) => {
    const i = Number(el.dataset.beat);
    put(el, "color", beatLands(c.path, i) && t >= BEAT_AT[i] ? "var(--color-ink)" : "var(--color-muted)");
  });
  const money = beatLands(c.path, 2) ? clamp01((t - RECEIPT_AT) / 0.4) : 0;
  if (n.beatMoney) put(n.beatMoney, "opacity", String(money));
  if (n.railTick) put(n.railTick, "opacity", String(beatLands(c.path, 2) ? clamp01((t - RECEIPT_AT) / 0.2) : 0));
}

/* The slide-to-answer spring (DESIGN.md: k 420, c 34, m 1), integrated
   in 4ms substeps off the rAF's own frame delta. Home is 0 while it rings;
   an answered knob runs on to the end of the track. The track's ends are
   hard stops — the knob never overshoots out of it. */
function stepSlider(ctx: Ctx, dt: number, real: number) {
  const sl = ctx.slider;
  if (sl.drag) {
    sl.v = 0;
    return;
  }
  const max = ctx.nodes.ownerMax;
  /* change 43a.1: the second call's knob sits home, disabled — it snaps
     there while the screen is down, so nothing is seen to travel. */
  if (ctx.call.path === "answered" && real >= secondCallAt(ctx.call.at) - 0.5) {
    sl.x = 0;
    sl.v = 0;
    return;
  }
  const target = ctx.call.path === "answered" ? max : 0;
  if (sl.x === target && sl.v === 0) return;
  let rem = dt;
  while (rem > 1e-6) {
    const h = Math.min(rem, 0.004);
    sl.v += (-SLIDE_K * (sl.x - target) - SLIDE_C * sl.v) * h;
    sl.x += sl.v * h;
    rem -= h;
  }
  if (sl.x < 0) {
    sl.x = 0;
    sl.v = 0;
  }
  if (sl.x > max) {
    sl.x = max;
    sl.v = 0;
  }
  if (Math.abs(sl.x - target) < 0.5 && Math.abs(sl.v) < 5) {
    sl.x = target;
    sl.v = 0;
  }
}

/* A fresh run: the phone rings again, the knob is home. */
function resetCall(ctx: Ctx) {
  ctx.call = { path: "ringing", at: 0, how: "" };
  ctx.slider.x = 0;
  ctx.slider.v = 0;
  ctx.slider.drag = false;
  ctx.slider.pid = null;
  ctx.lastReal = 0;
  ctx.lastNow = null;
  ctx.hapticReal = -1;
  ctx.hapticT = -1;
  ctx.credit = 0;
  ctx.creditLatched = false;
  ctx.setCredit(0);
}

/* A call left ringing where nobody can see it — section 1 scrolled away,
   the tab hidden — is not allowed to ring out unseen: the run re-arms, and
   the phone rings again from the top when section 1 is back. */
function parkIfRinging(ctx: Ctx) {
  if (ctx.reduced || ctx.armed || ctx.transition || ctx.call.path !== "ringing") return;
  if (ctx.raf != null) {
    cancelAnimationFrame(ctx.raf);
    ctx.raf = null;
  }
  park(ctx);
  if (ctx.mathRoll.started && !ctx.mathRoll.done) schedule(ctx);
}

/* change 43a.1: reduced motion — "the state changes, nothing travels"
   (DESIGN.md §2). The owner's phone stands still on the incoming call;
   Answer (a tap) and Decline cut straight to that path's SETTLED frame —
   the very frame the moving paths end on, painted once, no rAF. */
function paintReducedIncoming(ctx: Ctx) {
  resetCall(ctx);
  paintOwner(ctx, 0, 0);
  const ticket = usd(ctx.preset.ticket);
  ctx.nodes.stakeValues.forEach((el) => {
    putText(el, ticket);
  });
  if (ctx.nodes.ownerSlideLabel) put(ctx.nodes.ownerSlideLabel, "opacity", "1");
  if (ctx.nodes.controls) {
    put(ctx.nodes.controls, "visibility", "hidden");
    put(ctx.nodes.controls, "opacity", "0");
  }
  if (ctx.nodes.sceneClock) put(ctx.nodes.sceneClock, "opacity", "1");
  ctx.receiptLatched = false;
  ctx.setReceiptShown(false);
  ctx.root.dataset.callPath = "ringing";
  ctx.root.dataset.callHow = "";
  ctx.root.dataset.callSecond = "";
}
function paintReducedSettled(ctx: Ctx) {
  const c = ctx.call;
  const real = missAt(c.path, c.at) + (LOOP_UNTIL - CALL_ENDED_AT);
  paintScene(ctx, storyAt(real, c.path, c.at), real);
  if (ctx.nodes.sceneClock) put(ctx.nodes.sceneClock, "opacity", "0");
  ctx.root.dataset.callPath = c.path;
  ctx.root.dataset.callHow = c.how;
  ctx.root.dataset.callSecond = c.path === "answered" ? "missed" : "";
}
function reducedChoose(ctx: Ctx, path: "missed" | "answered") {
  if (!ctx.reduced || ctx.call.path !== "ringing") return;
  ctx.call = { path, at: 0, how: path === "missed" ? "decline" : "tap" };
  if (path === "answered") {
    ctx.credit = 1;
    ctx.creditLatched = true;
    ctx.setCredit(1);
  }
  ctx.receiptLatched = true;
  ctx.setReceiptShown(true);
  paintReducedSettled(ctx);
}

/* The owner acts (or the sixth ring runs out). Only a RINGING call on a
   running clock can end; the end is stamped at the last painted real time,
   so the next frame's clocks only move forward. */
function endCall(ctx: Ctx, path: "missed" | "answered", how: CallHow) {
  if (ctx.reduced || ctx.armed || ctx.transition || ctx.start == null || ctx.call.path !== "ringing") return;
  ctx.call = { path, at: ctx.lastReal, how };
  ctx.slider.drag = false;
  ctx.slider.pid = null;
  if (path === "missed") buzz(BUZZ_MISSED);
  schedule(ctx);
}

/* The slider's pointer plumbing. Pointer deltas are client px — divided by
   the screen's scale to land in the 360-wide design space the knob lives
   in. These write the drag position and nothing else; the tick paints. */
function slideDown(ctx: Ctx, track: HTMLElement, pid: number, clientX: number) {
  if (ctx.reduced || ctx.armed || ctx.transition || ctx.start == null || ctx.call.path !== "ringing") return;
  try {
    track.setPointerCapture(pid);
  } catch {}
  ctx.nodes.ownerMax = measureTravel(track, track.querySelector<HTMLElement>("[data-owner-knob]"));
  const screen = track.closest<HTMLElement>("[data-phone-screen]");
  const k = screen && screen.offsetWidth > 0 ? screen.getBoundingClientRect().width / screen.offsetWidth : 1;
  const sl = ctx.slider;
  sl.drag = true;
  sl.pid = pid;
  sl.startClient = clientX;
  sl.startX = sl.x;
  sl.k = k > 0 ? k : 1;
  sl.v = 0;
  schedule(ctx);
}
function slideMove(ctx: Ctx, pid: number, clientX: number) {
  const sl = ctx.slider;
  if (!sl.drag || pid !== sl.pid) return;
  sl.x = Math.min(ctx.nodes.ownerMax, Math.max(0, sl.startX + (clientX - sl.startClient) / sl.k));
  schedule(ctx);
}
function slideUp(ctx: Ctx, pid: number, released: boolean) {
  const sl = ctx.slider;
  if (!sl.drag || pid !== sl.pid) return;
  sl.drag = false;
  sl.pid = null;
  /* Released past the line, it answers; anything short (or a cancelled
     pointer) springs home and the phone keeps ringing. */
  if (released && sl.x >= SLIDE_ANSWER_AT * ctx.nodes.ownerMax) endCall(ctx, "answered", "swipe");
  else schedule(ctx);
}

/* One function, one clock. `t` is GLOBAL time (the call screen starts at 0);
   the pre-existing thread beats are thread-relative, offset by THREAD_START.
   change 43a: `t` is the STORY clock; `real` drives the owner's phone. */
function paintScene(ctx: Ctx, t: number, real: number = t) {
  const n = ctx.nodes;
  const tt = t - THREAD_START;
  paintOwner(ctx, t, real);
  /* change 48: the customer phone's painters (her outgoing call, the
     Messages banner, the thread's bubbles and typing dots, Delivered, the
     confirmation card) left with her phone in change 43a — no node they
     painted exists any more. 43b's customer phone restores them. */


  /* change 26 (B4): row [0] PUSHES — the outer's height grows from 0 to
     its natural height (rows 1-3 move down by exactly that height) while
     the inner slides down within the clip. No opacity animation (gate
     155); pre-insert it is geometry-hidden, not faded. */
  if (n.caughtRow0 && n.row0Inner) {
    const p = easeOut(clamp01((tt - CAUGHT_ROW_AT) / 0.32));
    if (p > 0 && p < 1) row0Height(n);
    if (p >= 1 || (p > 0 && n.row0H <= 0)) {
      put(n.caughtRow0, "height", "");
      put(n.caughtRow0, "visibility", "");
      put(n.caughtRow0, "overflow", "");
      put(n.row0Inner, "transform", "");
    } else {
      /* change 33 (C3): the clip belongs to the SLIDE, not to the settled
         row — the stamp reaches above the amount cell and must not be shorn
         off at the row's top edge once it lands. */
      put(n.caughtRow0, "overflow", "hidden");
      put(n.caughtRow0, "height", `${(p * n.row0H).toFixed(1)}px`);
      put(n.caughtRow0, "visibility", p === 0 ? "hidden" : "");
      put(n.row0Inner, "transform", `translateY(${((p - 1) * 100).toFixed(2)}%)`);
    }
  }

  /* Replay (section 1, bottom-left) lands on the settled beat —
     CONTROLS_AT is thread-relative 5.4 == global 11.0. (The down affordance
     is the persistent rail chevron now — change 15, A3.) */
  const c = clamp01((tt - CONTROLS_AT) / CONTROLS_FADE);
  if (n.controls) {
    put(n.controls, "visibility", c > 0 ? "visible" : "hidden");
    put(n.controls, "opacity", String(c));
  }

  /* change 36 (C1)'s beat strip is change 43a's progress rail — painted
     path-aware in paintOwner above. */

  /* --- Desktop scene type (change 15, A2): line 2 crossfades on the miss
         and again when the thread begins. Same clock as everything else. --- */
  const dialingIn = easeOut(clamp01((t - SCENE_DIALING_AT) / SCENE_FADE));
  const caughtIn = easeOut(clamp01((t - SCENE_CAUGHT_AT) / SCENE_FADE));
  n.sceneClosed.forEach((el) => put(el, "opacity", String(1 - dialingIn)));
  n.sceneDialing.forEach((el) => put(el, "opacity", String(Math.min(dialingIn, 1 - caughtIn))));
  /* change 33 (B3): the receipt takes this slot on the booking beat — the
     caught line fades out under it over 400ms, so the two never stack. */
  const receiptIn = clamp01((t - RECEIPT_AT) / 0.4);
  const deskCaught = new Set(n.sceneCaughtDesk);
  n.sceneCaught.forEach(
    (el) => put(el, "opacity", String(caughtIn * (deskCaught.has(el) ? 1 - receiptIn : 1))),
  );

  /* --- The sonar rings (change 18, D1): each ring is a pure function of
         (t - birthBeat) — radius grows to RING_MAX_FACTOR x the device
         height, opacity falls from RING_MAX_OPACITY, both ease-out. Three
         beats share two circles; a beat's ring is dead long before its
         circle is needed again. --- */
  /* change 43a: on the REAL clock — six rings while it rings; a ring is
     never born after the call ends (the ones in flight fade out). */
  if (n.sonarRings.length === 2 && n.sonarH > 0) {
    const live: ({ r: number; o: number } | null)[] = [null, null];
    ringBirths(ctx).forEach((beat, bi) => {
      const e = real - beat;
      if (e >= 0 && e < RING_DUR) {
        const p = easeOut(e / RING_DUR);
        live[bi % 2] = { r: RING_MAX_FACTOR * n.sonarH * p, o: RING_MAX_OPACITY * (1 - p) };
      }
    });
    n.sonarRings.forEach((c, j) => {
      const a = live[j];
      putAttr(c, "r", a ? a.r.toFixed(1) : "0");
      putAttr(c, "opacity", a ? a.o.toFixed(3) : "0");
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
    put(n.stamp, "opacity", String(clamp01(lt / 0.06)));
    if (lt >= 0.18) {
      put(n.stamp, "transform", "rotate(-6deg)");
    } else {
      const hp = 1 - Math.pow(1 - clamp01(lt / 0.18), 2);
      put(n.stamp, "transform", `rotate(${(-10 + 4 * hp).toFixed(2)}deg) scale(${(1.15 - 0.15 * hp).toFixed(3)})`);
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
  ctx.receiptLatched = false;
  ctx.setReceiptShown(false);
  resetCall(ctx);
  if (ctx.nodes.sceneClock) put(ctx.nodes.sceneClock, "opacity", "1");
  if (ctx.nodes.clockSeconds) putText(ctx.nodes.clockSeconds, ":00");
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
    put(sl, "clipPath", "");
  });
  /* change 26 (G5): announcements clear until the next settle. */
  ctx.announced = false;
  if (ctx.nodes.announceLeak) putText(ctx.nodes.announceLeak, "");
  if (ctx.nodes.announceRecovered) putText(ctx.nodes.announceRecovered, "");
  ctx.root.dataset.t = "0.000";
  ctx.root.dataset.tReal = "0.000";
  ctx.root.dataset.callPath = "ringing";
  ctx.root.dataset.callHow = "";
}

function beginPlayback(ctx: Ctx) {
  if (ctx.reduced || !ctx.armed || ctx.transition) return;
  ctx.armed = false;
  ctx.start = null;
  ctx.audio.lastT = -1;
  ctx.caretLatched = false;
  ctx.setCaretBob(false);
  resetCall(ctx);
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
      putText(el, final.replace(/[\d,]+/, Math.round(num * p5).toLocaleString("en-US")));
    });
    if (e >= 0.6) {
      ctx.mathRoll.done = true;
      ctx.nodes.mathNumerals.forEach(({ el, final }) => {
        putText(el, final);
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
        put(sl, "clipPath", wp >= 1 ? "" : `inset(0 ${((1 - wp) * 100).toFixed(1)}% 0 0)`);
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
      put(sl, "clipPath", "");
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
    ctx.armed = false;
    ctx.start = now;
    ctx.audio.lastT = -1;
    resetCall(ctx);
  }

  /* A parked run never plays (a park can land between a schedule() and
     its frame). */
  if (ctx.armed) return;

  if (ctx.start == null) ctx.start = now;
  /* change 43a: two clocks off the one rAF stamp. `real` is playback time;
     the sixth ring running out is the miss. `t` is the story clock every
     post-call beat is written in (lib/timeline.ts, storyAt). */
  const real = (now - ctx.start) / 1000;
  if (ctx.call.path === "ringing" && real >= RING_TIMEOUT) {
    ctx.call = { path: "missed", at: RING_TIMEOUT, how: "timeout" };
    ctx.slider.drag = false;
    ctx.slider.pid = null;
    buzz(BUZZ_MISSED);
  }
  const t = storyAt(real, ctx.call.path, ctx.call.at);
  const tt = t - THREAD_START;
  const p = ctx.preset;

  /* Up to 250ms of wall time per frame (4ms substeps keep it stable): a
     slow frame must not slow the spring, or it drifts off k 420 / c 34. */
  stepSlider(ctx, ctx.lastNow == null ? 0 : Math.min(0.25, (now - ctx.lastNow) / 1000), real);
  ctx.lastNow = now;
  ctx.lastReal = real;
  ctx.lastT = t;

  paintScene(ctx, t, real);
  paintFade(ctx, 1);
  paintNumbers(ctx, leakAt(tt, p.lost), panelRecoveredAt(tt, p.recovered, p.caught[ctx.credit].amount));
  paintFlaps(ctx, tt, (q) => leakAt(q, p.lost));
  /* change 43a.1: the answered call's in-call screen has ended (both
     incoming screens are down) — Salvage's credit moves to the second
     caller, before anything of theirs can show. */
  if (!ctx.creditLatched && ctx.call.path === "answered" && real >= ctx.call.at + ANSWER_HOLD) {
    ctx.creditLatched = true;
    ctx.credit = 1;
    ctx.setCredit(1);
  }
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
    if (voices && sharedMasterGain) voices.playFlapTick(ctx.audio.actx, sharedMasterGain);
    ctx.lastFlapTickAt = now;
  }
  ctx.lastFlapValue = flapNow;
  /* change 30 (G2): the clock seconds — one step per second, frozen when
     the call ends. change 43a: on the REAL clock while it rings (six rings
     run to ":07"), frozen at the second the owner acted or it rang out. */
  if (ctx.nodes.clockSeconds) {
    const sec = Math.floor(ctx.call.path === "ringing" ? real : ctx.call.at);
    putText(ctx.nodes.clockSeconds, ":0" + Math.min(9, Math.max(0, sec)));
  }
  /* change 30 (G1): the desktop clock crossfades out under the receipt. */
  if (ctx.nodes.sceneClock)
    put(ctx.nodes.sceneClock, "opacity", String(1 - clamp01((t - RECEIPT_AT) / 0.4)));
  if (!ctx.receiptLatched && t >= RECEIPT_AT) {
    ctx.receiptLatched = true;
    ctx.setReceiptShown(true);
  }
  ctx.root.dataset.t = t.toFixed(3);
  ctx.root.dataset.tReal = real.toFixed(3);
  ctx.root.dataset.callPath = ctx.call.path;
  ctx.root.dataset.callHow = ctx.call.how;
  ctx.root.dataset.callSecond =
    ctx.call.path !== "answered"
      ? ""
      : real < secondCallAt(ctx.call.at)
        ? "waiting"
        : real < missAt("answered", ctx.call.at)
          ? "ringing"
          : "missed";

  /* change 26 (G5): announce the settled figures ONCE, politely. */
  if (!ctx.announced && tt >= 5.5) {
    ctx.announced = true;
    if (ctx.nodes.announceLeak) putText(ctx.nodes.announceLeak, usd(p.lost));
    if (ctx.nodes.announceRecovered) putText(ctx.nodes.announceRecovered, usd(p.recovered));
  }

  /* change 20 (E1/E2): settle + toast latches, on the same phase. */
  if (!ctx.caretLatched && t >= 11) {
    ctx.caretLatched = true;
    ctx.setCaretBob(true);
  }
  if (!ctx.toastLatched && real >= 0.5) {
    ctx.toastLatched = true;
    ctx.fireToast();
  }

  /* Sound and haptics ride the same clocks this frame just painted with. */
  scheduleAudio(ctx, ctx.hapticReal, real, ctx.audio.lastT, t);
  scheduleHaptics(ctx, ctx.hapticReal, real, ctx.hapticT, t);
  ctx.audio.lastT = t;
  ctx.hapticReal = real;
  ctx.hapticT = t;

  /* change 30 (G5): the math roll — 600ms, once, on the same rAF. */
  const mr = ctx.mathRoll;
  if (mr.started && !mr.done) {
    if (mr.at == null) mr.at = now;
    const e = (now - mr.at) / 1000;
    const p5 = easeOut(clamp01(e / 0.6));
    ctx.nodes.mathNumerals.forEach(({ el, final }) => {
      const num = Number(final.replace(/[^0-9]/g, ""));
      const rolled = Math.round(num * p5);
      putText(el, final.replace(/[\d,]+/, rolled.toLocaleString("en-US")));
    });
    if (e >= 0.6) {
      mr.done = true;
      ctx.nodes.mathNumerals.forEach(({ el, final }) => {
        putText(el, final);
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



const buildQuery = (biz: string, name: string, refDjl = false) =>
  `?biz=${encodeURIComponent(biz)}${name ? `&name=${encodeURIComponent(name)}` : ""}${refDjl ? "&ref=djl" : ""}`;



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

/* ---------------------------------------------------------------------------
 * change 48: sections 2-4 load on intersection. Their code (the ledger, the
 * static phones, the panels, the close) lives in components/DemoSections.tsx,
 * its own chunk. The SERVER renders them inline as before — the HTML is the
 * whole page, the no-JS floor intact. The CLIENT does not hydrate them with
 * the page: <Deferred> renders an empty, hydration-exempt shell over the
 * server markup, so React never touches it and the first load neither
 * downloads nor runs their code. The first scroll of the pager or the first
 * input anywhere imports the chunk and swaps the live sections in, in a
 * transition (the server markup stays on screen until the new tree is
 * ready). The playback engine paints these sections' DOM either way — it
 * addresses nodes by data attribute — and re-collects them after the swap.
 * ------------------------------------------------------------------------- */
type SectionsModule = typeof import("@/components/DemoSections");
let sectionsModule: SectionsModule | null = null;
const loadSections = () =>
  import("@/components/DemoSections").then((m) => {
    sectionsModule = m;
    return m;
  });
/* The server warms the chunk at module init, so the lazy components below
   usually resolve synchronously; and on the server they render with NO
   Suspense boundary — a cold first request suspends the shell itself for
   the few ms the import takes. Either way the sections are written into the
   page inline, never as a streamed boundary (which needs a script to reveal
   it — and the no-JS floor has none). */
if (typeof window === "undefined") void loadSections();
/* A thenable that has already resolved: React.lazy reads it without
   suspending. */
const settled = <T,>(value: T) => ({ then: (resolve: (v: T) => void) => resolve(value) }) as unknown as Promise<T>;
const sectionLazy = (pick: (m: SectionsModule) => (props: SectionProps) => ReactNode) =>
  lazy(() => (sectionsModule ? settled({ default: pick(sectionsModule) }) : loadSections().then((m) => ({ default: pick(m) }))));
const SaveLazy = sectionLazy((m) => m.SaveSection);
const YoursLazy = sectionLazy((m) => m.YoursSection);
const CloseLazy = sectionLazy((m) => m.CloseSection);

function Deferred({ on, children }: { on: boolean; children: ReactNode }) {
  if (typeof window === "undefined") return <div data-deferred style={{ display: "contents" }}>{children}</div>;
  if (on)
    return (
      <div data-deferred style={{ display: "contents" }}>
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    );
  /* Hydration-exempt: React keeps the server children of an element whose
     client props carry dangerouslySetInnerHTML, and never diffs them. */
  return <div data-deferred style={{ display: "contents" }} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "" }} />;
}

/* change 26 (B2/B3): the save-section ink stagger — DOM order is the visual
   order. Re-stamped whenever the live sections replace the server markup. */
function stampInkDelays(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-section="save"] [data-ink]').forEach((el, i) => {
    el.style.setProperty("--ink-delay", `${700 + i * 40}ms`);
  });
}

/* After the swap, the engine's frame is painted at once on the new nodes —
   in the same commit, so no frame shows them unpainted. */
function repaintNow(ctx: Ctx) {
  if (ctx.reduced) {
    if (ctx.call.path !== "ringing") paintReducedSettled(ctx);
    return;
  }
  if (ctx.armed && !ctx.transition) {
    park(ctx);
    return;
  }
  const t = ctx.lastT;
  const tt = t - THREAD_START;
  const p = ctx.preset;
  paintScene(ctx, t, ctx.lastReal);
  paintNumbers(ctx, leakAt(tt, p.lost), panelRecoveredAt(tt, p.recovered, p.caught[ctx.credit].amount));
  paintFlaps(ctx, tt, (q) => leakAt(q, p.lost));
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
  /* change 30 (G1): the receipt mounts on the booking beat; SSR (and
     reduced motion) render it settled — park hides it for a motion run. */
  const [receiptShown, setReceiptShown] = useState(false);
  /* change 43a.1: which caller Salvage caught this run (0 first, 1 second). */
  const [credit, setCredit] = useState<0 | 1>(0);
  /* change 48: sections 2-4 are live (their chunk loaded and rendered). */
  const [sectionsOn, setSectionsOn] = useState(false);
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
  /* change 35 (A5): the section-1 device is SET DOWN once — pending holds
     it 16px low on the bare contact shadow, run lands it. */
  const [phoneEntry, setPhoneEntry] = useState<"pending" | "run" | null>(null);
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
    if (positionedRef.current || presetList.length < 2 || !sectionsOn) return;
    positionedRef.current = true;
    const track = yoursTrackRef.current;
    const idx = presetList.findIndex((p) => p.id === presetId);
    if (track && idx > 0) {
      /* change 33 (D2): with 94% panels the peek means scrollLeft arithmetic
         lands NEAR the snap point, not on it, and mandatory snap then nudges
         the track — a visible settle, and a rendered position that depends on
         when you look. The panel's own offsetLeft IS its snap point, and
         assigning scrollLeft touches only the track: scrollIntoView would
         drag the PAGER too and playback would never arm. */
      const panels = track.querySelectorAll<HTMLElement>("[data-panel]");
      const target = panels[idx];
      if (target && panels[0]) track.scrollLeft = target.offsetLeft - panels[0].offsetLeft;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetList, sectionsOn]);

  /* Re-bind to the DOM whenever React swaps the preset markup. Runs before
     paint, so the incoming preset never flashes at full opacity or final totals. */
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.preset = preset;
    ctx.nodes = collect(ctx.root);

    if (ctx.reduced) {
      ctx.shown = settledTotals(preset);
      paintReducedIncoming(ctx);
      return;
    }
    if (ctx.transition?.swapped) {
      resetCall(ctx);
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

  /* The receipt mounts mid-run — re-collect so the engine never paints a
     detached node and always finds a fresh one. */
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.nodes = collect(ctx.root);
  }, [receiptShown]);

  /* change 43a.1: the credit swap re-renders the notes, the ledger's row
     [0] and the owner card with the second caller — re-collect (their
     natural heights changed), and under reduced motion repaint the settled
     frame on the new heights. */
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.nodes = collect(ctx.root);
    if (ctx.reduced && ctx.call.path !== "ringing") paintReducedSettled(ctx);
  }, [credit]);

  /* change 48: the section swap hands a name typed into the server markup
     to the live handler (assigned below, beside onNameChange). */
  const onNameChangeRef = useRef<(raw: string) => void>(() => {});

  /* change 48: the first scroll of the pager, or the first input anywhere,
     makes sections 2-4 live. A page that is only loaded and looked at never
     downloads or runs their code. */
  useEffect(() => {
    if (sectionsOn) return;
    const pager = rootRef.current;
    let fired = false;
    const opts = { capture: true, passive: true } as const;
    /* focusin too: a field focused with no key or pointer (assistive tech,
       autofill) is input all the same. */
    const triggers = ["pointerdown", "keydown", "touchstart", "wheel", "focusin"] as const;
    const off = () => {
      for (const e of triggers) window.removeEventListener(e, go, opts);
      pager?.removeEventListener("scroll", go);
    };
    function go(e: Event) {
      if (fired) return;
      /* A touch that starts in section 1 is the owner's phone being used
         (the slide-to-answer, Decline): the swap's commit must never land
         mid-gesture. The visitor's first scroll brings the sections in. */
      if (e.type !== "keydown" && e.type !== "wheel" && e.target instanceof Element && e.target.closest('[data-section="call"]')) return;
      fired = true;
      off();
      void loadSections().then(() => {
        /* What the visitor did in the server markup while the chunk loaded
           carries over — read at the swap, not at the first input (a tap's
           pointerdown lands before its focus): the control that holds
           focus, and anything typed into the name field. */
        const a = document.activeElement;
        if (a instanceof HTMLElement && a.closest("[data-deferred]")) {
          const attr = [...a.attributes].find((x) => x.name.startsWith("data-"));
          if (attr) focusBeforeSwap.current = { attr: attr.name, value: attr.value };
        }
        const typed = rootRef.current?.querySelector<HTMLInputElement>("[data-deferred] [data-name-input]")?.value ?? "";
        startTransition(() => {
          setSectionsOn(true);
          if (typed) onNameChangeRef.current(typed);
        });
      });
    }
    for (const e of triggers) window.addEventListener(e, go, opts);
    pager?.addEventListener("scroll", go, { passive: true });
    /* change 43a.1 x 48: React state that sections 2-4 render, changed from
       section 1 — the answered path's credit — brings them in too: the
       server markup cannot re-render the credited caller. The flip lands
       1.8s after the answer, so the swipe is long over. */
    if (credit === 1) go(new Event("state"));
    return off;
  }, [sectionsOn, credit]);

  /* The swap committed: the engine re-binds to the new nodes and paints its
     current frame onto them before this frame reaches the screen; the ink
     stagger is re-stamped; focus that sat in the replaced markup moves to
     the same control in the live one. */
  const focusBeforeSwap = useRef<{ attr: string; value: string } | null>(null);
  useLayoutEffect(() => {
    if (!sectionsOn) return;
    const ctx = ctxRef.current;
    const root = rootRef.current;
    if (!ctx || !root) return;
    ctx.nodes = collect(root);
    stampInkDelays(root);
    repaintNow(ctx);
    const f = focusBeforeSwap.current;
    const el = f ? root.querySelector<HTMLElement>(`[${f.attr}="${f.value}"]`) : null;
    el?.focus();
    /* A field keeps its caret at the end of what was carried over. */
    if (el instanceof HTMLInputElement && el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
  }, [sectionsOn]);

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
      call: { path: "ringing", at: 0, how: "" },
      slider: { x: 0, v: 0, drag: false, pid: null, startClient: 0, startX: 0, k: 1 },
      lastReal: 0,
      lastT: 0,
      lastNow: null,
      hapticReal: -1,
      hapticT: -1,
      credit: 0,
      creditLatched: false,
      setCredit,
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
      /* change 43a.1: reduced motion stands still on the incoming call —
         Answer and Decline cut to their settled frames (reducedChoose). The
         rest of the page is the SSR settled state. */
      paintReducedIncoming(ctx);
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
      ...root.querySelectorAll<HTMLElement>("[data-call-stage] [data-stake-line]"),
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
    /* change 35 (A5): pending must be PAINTED before run, or the transition
       has no start value — hence two frames, not one. Reduced motion never
       reaches here (the branch above returned), so it never rises. */
    setPhoneEntry("pending");
    requestAnimationFrame(() => requestAnimationFrame(() => setPhoneEntry("run")));
    /* A custom property, NOT transition-delay: a bare inline delay rides the
       default transition-property:all and defers EVERY style change (the
       pending->hidden flip included) by up to 1.2s. Only the "run" rule
       consumes the var. */
    stampInkDelays(root);

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
            /* change 48: a section's entry plays on its LIVE nodes — sections
               2-4 latch only once the swap is in (this observer re-attaches
               then and reports again), or the swap would replace a running
               wipe with nodes already at its end. */
            if (idx === 0 || sectionsOn) setEntered((prev) => (prev[idx] ? prev : prev.map((v, i) => (i === idx ? true : v))));
          }
          if (sections[idx].dataset.section === "call") {
            const ctx = ctxRef.current;
            if (ctx) {
              ctx.callSectionVisible = on;
              if (on) beginPlayback(ctx);
              else parkIfRinging(ctx);
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
            /* change 34 (B): a panel less than 40% into view shows GROUND
               only — its content fades out. Same observer, one more
               threshold; the peek never needs a clock of its own. */
            (e.target as HTMLElement).dataset.peek = e.intersectionRatio >= 0.4 ? "shown" : "hidden";
            if (e.intersectionRatio >= 0.6) {
              const i = panels.indexOf(e.target as HTMLElement);
              if (i >= 0) onPanel(i, e.target as HTMLElement);
            }
          });
        },
        { root: track, threshold: [0.4, 0.6] },
      );
      panels.forEach((p) => io.observe(p));
      panelIOs.push(io);
    };
    watchTrack(yoursTrackRef.current, (i, el) => {
      setYoursPanel(i);
      const id = el.dataset.preset;
      if (id) onTrackPresetRef.current(id);
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

    /* change 43a: a hidden tab parks a ringing call; coming back to section
       1 rings it again from the top. */
    const onVisibility = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (document.hidden) parkIfRinging(ctx);
      else if (ctx.callSectionVisible) beginPlayback(ctx);
    };
    document.addEventListener("visibilitychange", onVisibility);

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
      /* change 43a: a rotate re-measures the device — the slider's travel
         and the sonar's height read 0 while the landscape guard hid it. */
      ctx.nodes = collect(ctx.root);
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
            : Math.round(track.scrollLeft / Math.max(1, panels[0]?.offsetWidth ?? track.clientWidth));
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
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
    /* change 24: the panels (and their IntersectionObservers) exist per
       presetList render — re-attach when the JSON hydration fills the
       track. change 48: and when the live sections replace the server
       markup. */
  }, [presetList, sectionsOn]);

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

  useEffect(
    () => () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      if (nameTimer.current != null) window.clearTimeout(nameTimer.current);
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
  useLayoutEffect(() => {
    onNameChangeRef.current = onNameChange;
  });

  /* change 39 (A1): the phone screen lays out at 360 design px and is
     scaled by a transform. A ResizeObserver measures the glass content box
     and writes the factor and the design height it implies — k = width/360,
     h = height/k — so the scaled screen lands on the box exactly. This
     replaces `zoom`, which is non-standard and, on the real device, clipped
     the screen's left edge and undersized the phone. Every static instance
     is observed too, and re-observed when the other three presets hydrate. */
  useEffect(() => {
    const fits = Array.from(document.querySelectorAll<HTMLElement>('[data-screen-fit="aspect"]'));
    if (fits.length === 0) return;
    const apply = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const k = r.width / 360;
      el.style.setProperty("--screen-k", String(k));
      el.style.setProperty("--screen-h", `${r.height / k}px`);
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.target as HTMLElement);
    });
    for (const el of fits) {
      apply(el);
      ro.observe(el);
    }
    return () => ro.disconnect();
  }, [presetList.length, sectionsOn]);

  /* change 35 (D1): the layout height is the VISUAL viewport, read on load
     and on every resize. Safari moves it by ~100px between toolbar states
     and svh is only the spec guess at the collapsed one. Updates are
     SKIPPED while a text field holds focus: the software keyboard shrinks
     the visual viewport too, and resizing every section down to the
     keyboard leftovers would tear the pager off its snap point mid-typing
     (the section-3 accommodation above owns that case). */
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const h = vv ? vv.height : window.innerHeight;
      if (h > 0) document.documentElement.style.setProperty("--vh", `${Math.round(h)}px`);
    };
    apply();
    vv?.addEventListener("resize", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  const onReplay = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.reduced) {
      paintReducedIncoming(ctx);
      return;
    }
    /* A click landing inside the 500ms swap is discarded: nulling the
       transition before its half-point would cancel the un-committed
       setPresetId (change 10 review lens 2, finding 2). */
    if (ctx.transition) return;
    ctx.armed = false;
    ctx.start = null;
    ctx.audio.lastT = -1;
    ctx.caretLatched = false;
    setCaretBob(false);
    ctx.receiptLatched = false;
    setReceiptShown(false);
    resetCall(ctx);
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
      /* change 43a: only while the phone is still RINGING — an answered
         call also holds the story under 3.6, and must not ring again. */
      if (Number.isFinite(t) && t > 0 && t < 3.6 && !ctx.armed && !ctx.transition && ctx.call.path === "ringing") {
        ctx.start = null;
        ctx.audio.lastT = -1;
        ctx.caretLatched = false;
        setCaretBob(false);
        resetCall(ctx);
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
    if (ctx?.reduced) paintReducedIncoming(ctx);
    if (ctx && !ctx.reduced && !ctx.transition) {
      ctx.armed = false;
      ctx.start = null;
      ctx.audio.lastT = -1;
      ctx.caretLatched = false;
      setCaretBob(false);
      ctx.receiptLatched = false;
      setReceiptShown(false);
      resetCall(ctx);
      schedule(ctx);
    }
    goSection(0);
  };

  /* change 43a: the owner's controls. Decline and the slider only ever
     WRITE intent (the call's path, the knob's drag position); the one rAF
     paints. */
  const ownerHandlers: OwnerHandlers = {
    onDecline: () => {
      const ctx = ctxRef.current;
      if (ctx?.reduced) reducedChoose(ctx, "missed");
      else if (ctx) endCall(ctx, "missed", "decline");
    },
    onSlideTap: () => {
      /* Reduced motion only: a tap on the track answers (nothing slides). */
      const ctx = ctxRef.current;
      if (ctx?.reduced) reducedChoose(ctx, "answered");
    },
    onSlideDown: (e) => {
      const ctx = ctxRef.current;
      if (ctx) slideDown(ctx, e.currentTarget, e.pointerId, e.clientX);
    },
    onSlideMove: (e) => {
      const ctx = ctxRef.current;
      if (ctx) slideMove(ctx, e.pointerId, e.clientX);
    },
    onSlideUp: (e) => {
      const ctx = ctxRef.current;
      if (ctx) slideUp(ctx, e.pointerId, e.type === "pointerup");
    },
    onSlideKey: (e) => {
      /* The knob is a button to assistive tech (VoiceOver presents iOS's
         own slide-to-answer the same way): Enter or Space answers. Handled
         here, so the pager never sees the Space. */
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const ctx = ctxRef.current;
      if (ctx?.reduced) reducedChoose(ctx, "answered");
      else if (ctx) endCall(ctx, "answered", "key");
    },
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

  /* change 36 (F3): the text the CTA opens. The approved ask, plus the
     visitor's own business name when they have typed one — so the message
     that lands on Andy's phone already says who it is from. */
  const smsHref = `${COPY.contact.smsHref}?body=${encodeURIComponent(
    name ? `Show me Salvage for ${name}` : "Show me Salvage",
  )}`;

  const sectionProps: SectionProps = {
    preset,
    presetList,
    bizName,
    liveName,
    nameInput,
    name,
    credit,
    dates,
    hasPhoto,
    refDjl,
    smsHref,
    yoursPanel,
    yoursTrackRef,
    onNameChange,
    onLoop,
    goPanel,
  };

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
      data-sections={sectionsOn ? "on" : "off"}
      aria-label={COPY.a11y.pager}
      style={{ "--accent": preset.accent, "--accent-soft": preset.accentSoft, "--accent-ink": preset.accentInk } as CSSProperties}
    >
      <div data-top-cluster data-chrome="cluster" className="fixed right-3 top-3 z-40 flex gap-3 min-[1100px]:right-10 min-[1100px]:top-6">
        <button
          data-share
          data-rail-share
          type="button"
          onClick={onShare}
          title={COPY.shareLabel}
          aria-label={COPY.a11y.share}
          className={`flex h-5 w-5 items-center justify-center bg-transparent text-ink outline-none transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2 ${
            share === "copied" ? "opacity-100" : "opacity-60"
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
          className={`flex h-5 w-5 items-center justify-center bg-transparent text-ink outline-none transition-opacity focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2 ${
            soundOn ? "opacity-100" : "opacity-60"
          }`}
        >
          <SpeakerGlyph on={soundOn} />
        </button>
      </div>

      {/* Share fallback (clipboard unavailable): floats beside the rail,
          which carries the Share control itself now (A3). change 48: at page
          level — sections 2-4 carry paint containment, which would anchor a
          fixed element to the section instead of the viewport. */}
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
      {toastOn && (
        <div
          data-sound-toast
          className="fixed right-3 top-10 z-40 text-[12px] text-muted min-[1100px]:right-10 min-[1100px]:top-16"
        >
          {COPY.a11y.tapForSound}
        </div>
      )}

      {/* change 36 (A1) / change 37: the rail is gone at EVERY width. It
          indexed four sections without indicating anything — no active
          fill, on a page that snaps — and mobile had already proved
          nothing was missing without it. */}

      {/* The caret is the one piece of wayfinding, bottom centre at every
          width. */}
      <button
        data-rail-next
        data-chrome="caret"
        type="button"
        onClick={() => goSection(activeSection + 1)}
        aria-label={COPY.a11y.next}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 z-40 flex h-8 w-5 -translate-x-1/2 items-center justify-center text-teal outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-teal-bright ${
          activeSection >= SECTIONS.length - 1 ? "hidden" : ""
        }`}
      >
        <span className={caretBob ? "rail-bob" : ""}>
          <ChevronGlyph />
        </span>
      </button>
      {/* ---- SECTION 1 — the call. The phone; at >=1100px the scene type
           sits left of it (change 15, A2), all three lines on the one clock. ---- */}
      <section data-section="call">
        {/* change 36 (A7/C4): the section-1 accent band is GONE. The ground
            is abyss, the phone is centred on it, and the only colour in the
            frame is what is on the screen. */}
        <SectionMark {...COPY.sections.call} />

        {/* change 16 (B1/B2): below 1100px the right padding clears the
            40px rail column (56px total) and the top padding reserves the
            section mark's block — content starts >= 32px below its
            baseline, so the phone can never ride up into the mark. */}
        {/* change 27 (B1): >=1100 a [1fr_auto_1fr] grid — the DEVICE is the
            centered column, the scene type right-aligned in the left third,
            vertically centered on the phone. */}
        <div data-section-content className="relative z-10 flex h-full w-full items-center justify-center gap-16 pb-[calc(64px+env(safe-area-inset-bottom))] pl-6 pr-6 pt-16 max-[1099.98px]:items-start min-[1100px]:mx-auto min-[1100px]:grid min-[1100px]:max-w-[1240px] min-[1100px]:grid-cols-[61fr_auto_39fr] min-[1100px]:gap-x-0 min-[1100px]:px-12 min-[1100px]:pb-12 min-[1100px]:pt-6">
          <div data-scene data-client-world className="relative hidden shrink-0 min-[1100px]:block min-[1100px]:justify-self-start min-[1100px]:self-center min-[1100px]:-translate-y-8">
            {/* change 30 (G1): the slab receipt — the clock crossfades out
                beneath it on the booking beat. Gold census +1 (gate 175);
                the off-viewport mount computes transparent so the census
                stays exact. */}
            {receiptShown && (
              <p
                data-receipt
                data-figure="hero"
                className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden items-center text-[120px] font-medium leading-none text-gold max-[1099.98px]:text-transparent min-[1100px]:flex"
              >
                +${preset.caught[credit].amount}
              </p>
            )}
            <div data-scene-clock>
            {/* change 18 (B4): the clock is a timestamp — it runs in mono
                like every figure on the page. change 27 (A): 160px — it
                wraps at the space into a clock lockup. */}
            <p data-scene-time data-figure="hero" className="text-[160px] font-medium leading-none text-ink">
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
            {/* change 43a: the stake — what this call is worth losing,
                counting up in ember over the six rings and frozen at the
                miss. Outside the clock block, so it stays when the receipt
                takes the clock's place. Label 17 / data 28 (DESIGN.md). SSR
                seeds the settled (missed) figure. */}
            <p data-stake-line className="mt-8">
              <span data-stake-body className="flex items-baseline gap-3">
                <span className="text-[17px] font-medium text-muted">{COPY.yours.rows.ticket}</span>
                <span data-stake-value data-figure="data" className="text-[28px] leading-none text-ember">
                  {usd(preset.ticket)}
                </span>
              </span>
            </p>
          </div>

          {/* change 27 (B1): the stage column carries an explicit width — a
              shrink-wrapped grid column gives the aspect-boxed device
              nothing to size against (globals sets 82dvh * 390/810). */}
          <div data-call-stage data-phone-entry={phoneEntry ?? undefined} className="w-full max-w-[390px] shrink-0">
            {/* change 43a: the mobile caption's slot (and its h-7 budget) is
                the stake line now — the label and the ember figure that
                counts up while the owner's phone rings. */}
            <div data-stake-line data-chrome="caption" data-client-world className="relative mb-4 h-7 min-[1100px]:hidden">
              {/* Label 17 / data 20 (DESIGN.md), baselines shared. */}
              <span data-stake-body className="flex h-7 items-baseline gap-2">
                <span className="text-[17px] font-medium leading-7 text-muted">{COPY.yours.rows.ticket}</span>
                <span data-stake-value data-figure="data" className="text-[20px] leading-7 text-ember">
                  {usd(preset.ticket)}
                </span>
              </span>
            </div>
            {/* change 43a: section 1's device is the OWNER's phone. */}
            <PhoneOwner preset={preset} bizName={bizName} sonar ownerHandlers={ownerHandlers} credit={credit} />
            {/* change 36 (C1) -> change 43a: the beat strip is a three-segment
                progress rail. Each segment fills in accent on the beat its
                word names; a 2px gold tick and "+${ticket}" land on the
                booking, the money 12px right of BOOKED. An answered call
                fills the third alone — it never missed and never texted.
                Words in the DESIGN.md caption role (Plex Sans 500, 13,
                +0.04em, uppercase), the money in the data role (Plex Mono
                20). Columns size to their words (the whole rail measures
                309px, so it holds at 360). SSR fills the rail; the money and
                its tick ship at opacity 0 — the money is a beat (gate 184). */}
            <div data-beats data-chrome="beats" className="mt-6 h-6">
              <div data-progress-rail className="grid h-6 grid-cols-[minmax(max-content,1fr)_minmax(max-content,1fr)_auto] gap-x-3">
                {[COPY.beats.missed, COPY.beats.text, COPY.beats.booked].map((w, i) => (
                  <div key={w} className="flex flex-col">
                    <span className="relative block h-[2px] bg-[rgba(233,238,244,0.14)]">
                      <span
                        data-rail-fill={i}
                        data-accent-ok
                        className="absolute inset-0 origin-left bg-[var(--accent,#8AA0B4)]"
                      />
                      {i === 2 && (
                        <span data-rail-tick className="absolute -top-[3px] right-0 h-2 w-[2px] bg-gold" style={{ opacity: 0 }} />
                      )}
                    </span>
                    {/* A zero-width 20px strut (a pseudo-element, no text node)
                        gives every label row the money's baseline, so the
                        three words sit on one line with or without it. */}
                    <span className="mt-1.5 flex h-4 items-baseline whitespace-nowrap after:text-[20px] after:leading-4 after:content-['\200b']">
                      <span
                        data-beat={i}
                        className="text-[13px] font-medium uppercase leading-4 tracking-[0.04em]"
                        style={{ color: "var(--color-ink)" }}
                      >
                        {w}
                      </span>
                      {i === 2 && (
                        <span
                          data-beat-money
                          data-figure="data"
                          className="ml-3 text-[20px] leading-4 text-gold"
                          style={{ opacity: 0 }}
                        >
                          +${preset.caught[credit].amount}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* change 26 (C7): the settled pair — centered under the
                phone, 24px below the bezel, 12px apart. The engine lands
                them at settle. change 36 (C3): under the beat strip. */}
            {/* change 33 (B5): ONE row, two equal-width buttons, centered
                under the phone with a 12px gap — never stacked. */}
            <div data-controls data-chrome="controls" className="mt-4 flex flex-row items-center justify-center gap-3">
              <button data-replay type="button" onClick={onReplay} className={`w-[46%] max-w-[180px] ${btnSecondary}`}>
                {COPY.replayLabel}
              </button>
              <button data-your-side data-client-world type="button" onClick={() => goSection(1)} className={`w-[46%] max-w-[180px] ${btnSecondary}`}>
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
        <Deferred on={sectionsOn}>
          <SaveLazy {...sectionProps} />
        </Deferred>
      </section>

      {/* ---- SECTION 3 — make it yours (change 15, A4): ONE live-skin
           device (the active preset's), full and contained on desktop,
           bottom-anchored with a deliberate ~55% bleed on mobile. The track
           carries label + tiles per preset and stays the page-wide
           switcher; dots + cue sit ABOVE the phone on mobile. ---- */}
      <section data-section="yours" data-entry-fx={fxReady ? (entered[2] ? "run" : "pending") : undefined}>
        <Deferred on={sectionsOn}>
          <YoursLazy {...sectionProps} />
        </Deferred>
      </section>

      {/* ---- SECTION 4 — the math (change 13, S4): the line is the largest
           type on the page and owns the section. Numerals gold at the line's
           own size. ---- */}
      {/* change 16 (B8): section 4 stands on the SAME ground as sections
          1-3 — the surface band read as a different page bolted on. The
          border-t stays: a rule is structure, not ground. */}
      <section data-section="math" data-bottom-band data-entry-fx={fxReady ? (entered[3] ? "run" : "pending") : undefined}>
        <Deferred on={sectionsOn}>
          <CloseLazy {...sectionProps} />
        </Deferred>
      </section>

      {/* ---- The rail (change 15, A3): Share, sound, dots, next-chevron —
           persistent on the right edge in every section. ---- */}
      {/* change 18 (C6/A4): the share + sound controls are a TOP-RIGHT
          cluster of 28px teal-stroke squares now; the rail keeps only the
          6px square dots and the 1px caret. change 16's gutter contract
          (rail inside the 40px right column, content padded 56px) stands. */}
      {/* change 36 (A2): glyph-only. No box, no stroke, ink at 60% — and
          sound-on is ink at 100%, which is the whole state machine. */}
    </main>
  );
}
