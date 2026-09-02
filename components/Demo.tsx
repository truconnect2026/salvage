"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import Ledger from "@/components/Ledger";
import Phone, { NotifyCard, StatusGlyphs } from "@/components/Phone";
import { COPY, MAX_NAME_LEN, PRESETS, SHARE_ORIGIN, resolveName, type Preset } from "@/lib/client.config";
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
  CONTROLS_AT,
  CONTROLS_FADE,
  DELIVERED_AT,
  DOT_PERIOD,
  LOOP_UNTIL,
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
  downCue: HTMLElement | null;
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
  setPresetId: (id: string) => void;
};

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
    downCue: q("[data-down-cue]"),
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

  /* Replay (section 1, bottom-left) and the down-cue land together on the
     settled beat — CONTROLS_AT is thread-relative 5.4 == global 11.0. */
  const c = clamp01((tt - CONTROLS_AT) / CONTROLS_FADE);
  if (n.controls) {
    n.controls.style.visibility = c > 0 ? "visible" : "hidden";
    n.controls.style.opacity = String(c);
  }
  if (n.downCue) {
    n.downCue.style.visibility = c > 0 ? "visible" : "hidden";
    n.downCue.style.opacity = String(c);
  }

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
  }

  if (ctx.start == null) ctx.start = now;
  const t = (now - ctx.start) / 1000;
  const tt = t - THREAD_START;
  const p = ctx.preset;

  paintScene(ctx, t);
  paintFade(ctx, 1);
  paintNumbers(ctx, leakAt(tt, p.lost), panelRecoveredAt(tt, p.recovered, p.caught[0].amount));
  ctx.root.dataset.t = t.toFixed(3);

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

/* change 13 (S2d): Share is a teal FILL now — the section's one big action.
   Full width minus margins on phones, >=280px centered on desktop. */
const shareFill =
  "rounded-full bg-teal px-8 py-3.5 text-[15px] font-semibold text-abyss " +
  "transition-colors hover:bg-teal-bright outline-none w-full min-[600px]:w-auto min-[600px]:min-w-[280px] " +
  "focus-visible:ring-2 focus-visible:ring-teal-bright focus-visible:ring-offset-2 focus-visible:ring-offset-abyss";

const buildQuery = (biz: string, name: string) =>
  `?biz=${encodeURIComponent(biz)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;

/* Wayfinding, not headlines (change 13, G3): kicker 12px tracked, title
   Fraunces 28px, muted, 32px inset. Below 1100px the title runs 20px — at
   28px it would sit on the section-1 phone's status row on a 390px screen. */
function SectionMark({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="pointer-events-none absolute left-8 top-8 z-20">
      <p className="text-[12px] uppercase tracking-[0.3em] text-muted">{kicker}</p>
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

/* Section 3's per-preset phone (change 13, S3a/b): the top of a real device —
   status row, contact header, thread[0] — LIVE-skinned by the name field.
   This is the one place the visitor watches their own name land on a phone.
   thread[0]'s bizName mention follows the live name too: a pure substitution
   inside the existing approved string, no new copy. */
function PhoneTop({ preset, bizName }: { preset: Preset; bizName: string }) {
  const text = preset.thread[0].text.replace(preset.bizName, bizName);
  return (
    <div
      className="w-full overflow-hidden rounded-t-[56px] bg-[#05090F] p-3 pb-0 ring-1 ring-inset ring-line/60"
      style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 24px 60px -24px rgba(0,0,0,0.8)" }}
    >
      <div className="relative overflow-hidden rounded-t-[44px] bg-surface pb-6 font-phone">
        <div className="absolute left-1/2 top-0 z-40 h-[26px] w-[120px] -translate-x-1/2 rounded-b-[14px] bg-[#05090F]" />
        <div className="relative z-10 flex h-[36px] items-center justify-between px-6 pt-1">
          <span className="text-[13px] font-semibold tabular-nums text-ink">{COPY.chrome.phone.statusTime}</span>
          <StatusGlyphs />
        </div>
        <div className="border-b border-line bg-surface-2 px-6 pb-3 pt-2 text-center">
          <div data-crop-biz={preset.id} className="truncate text-[15px] font-semibold leading-tight text-ink">
            {bizName}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{COPY.chrome.phone.threadLabel}</div>
        </div>
        <div className="px-4 pt-3">
          <div className="pb-1.5 text-center text-[11px] tabular-nums text-muted">{preset.thread[0].time}</div>
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[20px] rounded-bl-[6px] bg-surface-2 px-[14px] py-2 text-left text-[17px] leading-[1.29] text-ink">
              {text}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Demo({
  initialPresetId,
  initialName = "",
}: {
  initialPresetId: string;
  initialName?: string;
}) {
  const [presetId, setPresetId] = useState(initialPresetId);
  const [share, setShare] = useState<"idle" | "copied" | "manual">("idle");
  /* nameInput is the raw field; name is the committed (debounced, trimmed)
     value that re-skins the page. SSR seeds both from &name=, so a shared
     link renders the custom name with no flash of the default. */
  const [nameInput, setNameInput] = useState(initialName);
  const [name, setName] = useState(initialName);
  /* Wayfinding state: the active section (right-edge dots) and each track's
     active panel (dots beneath). Driven by IntersectionObservers, not scroll
     math (A3). */
  const [activeSection, setActiveSection] = useState(0);
  const [savePanel, setSavePanel] = useState(0);
  const [yoursPanel, setYoursPanel] = useState(() =>
    Math.max(0, PRESETS.findIndex((p) => p.id === initialPresetId)),
  );
  /* One-shot swipe cues (B2/B3): shown when their section first becomes
     active, dismissed by the first horizontal scroll or a 4s timeout. */
  const [saveCueGone, setSaveCueGone] = useState(false);
  const [yoursCueGone, setYoursCueGone] = useState(false);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const bizName = name || preset.bizName;
  const shareUrl = `${SHARE_ORIGIN}/${buildQuery(preset.id, name)}`;

  const rootRef = useRef<HTMLElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const saveTrackRef = useRef<HTMLDivElement>(null);
  const yoursTrackRef = useRef<HTMLDivElement>(null);
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
      setPresetId,
    };
    ctxRef.current = ctx;

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
    watchTrack(saveTrackRef.current, (i) => setSavePanel(i));
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
    const saveTrack = saveTrackRef.current;
    const yoursTrack = yoursTrackRef.current;
    const dismissSave = () => setSaveCueGone(true);
    const dismissYours = () => setYoursCueGone(true);
    let cueRaf = requestAnimationFrame(() => {
      cueRaf = requestAnimationFrame(() => {
        saveTrack?.addEventListener("scroll", dismissSave, { once: true, passive: true });
        yoursTrack?.addEventListener("scroll", dismissYours, { once: true, passive: true });
      });
    });

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
      saveTrack?.removeEventListener("scroll", dismissSave);
      yoursTrack?.removeEventListener("scroll", dismissYours);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /* Cue timers: each cue starts its 4s dismissal when its section first
     becomes active. UI plumbing (React state), not an animation clock. */
  useEffect(() => {
    const id = SECTIONS[activeSection]?.id;
    if (id === "save" && !saveCueGone) {
      const t = window.setTimeout(() => setSaveCueGone(true), 4000);
      return () => window.clearTimeout(t);
    }
    if (id === "yours" && !yoursCueGone) {
      const t = window.setTimeout(() => setYoursCueGone(true), 4000);
      return () => window.clearTimeout(t);
    }
  }, [activeSection, saveCueGone, yoursCueGone]);

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
      /* Prefer an in-flight swap's TARGET preset: a debounce firing during
         the half-second transition must not resurrect the outgoing preset's
         id into the URL (change 10 review lens 2, finding 4). */
      const ctx = ctxRef.current;
      syncUrl(ctx?.pendingPresetId ?? ctx?.transition?.to.id ?? ctx?.preset.id ?? presetId, clean);
    }, 150);
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
    schedule(ctx);
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
      {/* ---- SECTION 1 — the call. The phone, and nothing else. ---- */}
      <section data-section="call">
        <Glow />
        <SectionMark {...COPY.sections.call} />

        <div className="relative z-10 flex h-full w-full items-center justify-center p-6">
          <Phone preset={preset} bizName={bizName} typingBefore={[2]} />
        </div>

        {/* Replay: one ghost button, bottom-left, lands settled (engine). */}
        <div data-controls className="absolute bottom-6 left-5 z-20 min-[1100px]:left-10">
          <button data-replay type="button" onClick={onReplay} className={ghost}>
            {COPY.replayLabel}
          </button>
        </div>

        {/* Down-cue: bottom center, lands settled (engine), chevron bobs in
            CSS (ambient wayfinding, not a playback beat — and the rAF loop
            parks after LOOP_UNTIL, so a looping chevron cannot ride it). */}
        <div
          data-down-cue
          className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-1 text-muted"
        >
          <span className="text-[12px]">{COPY.cues.down}</span>
          <svg
            width="16"
            height="9"
            viewBox="0 0 16 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="cue-bob"
          >
            <path d="M2 2l6 5l6-5" />
          </svg>
        </div>
      </section>

      {/* ---- SECTION 2 — the save. Headline + the two-sided moment.
           change 13 (S2a/b): the headline lives INSIDE the left column /
           first panel, and the static phone beneath it runs at full scale —
           bleeding off the section bottom by design, thread anchored to its
           FIRST bubble (the device clips from the bottom, never the top). ---- */}
      <section data-section="save">
        <Glow />
        <SectionMark {...COPY.sections.save} />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col px-6 pb-[84px] pt-[88px] min-[1100px]:px-10 min-[1100px]:pb-6 min-[1100px]:pt-6">
          {/* Mobile: a two-panel horizontal track (headline + phone | ledger).
              Desktop >=1100: the same two children as a 40/60 two-up grid —
              the overrides live in globals.css under [data-section="save"].
              change 14: the desktop frame starts at the 24px margin (beside
              the section mark, not below it) — that headroom is what lets a
              >=340px phone be FULLY CONTAINED (availH = section - headline -
              48; the sub moved to the right column to buy the rest). */}
          <div ref={saveTrackRef} data-track className="min-h-0 w-full flex-1">
            <div data-panel className="flex min-h-0 flex-col px-1 min-[1100px]:px-0">
              <header data-headline className="shrink-0">
                {/* change 14: 30px on desktop — at clamp's 44px the h1 runs
                    four lines in the 40% column and the >=340px phone can no
                    longer be contained (availH = 852 - headline). Below
                    1100px this matches change 13's rendered size exactly
                    (the old clamp bottomed out at 32px there). */}
                <h1 className="max-w-3xl font-display font-medium leading-[1.12] text-ink text-[32px] min-[1100px]:text-[30px]">
                  {COPY.headline}
                </h1>
                {/* Mobile keeps the sub here; on desktop it lives in the
                    right column (change 14 — see data-save-stack below). */}
                <p data-sub className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted min-[1100px]:hidden">
                  {COPY.sub}
                </p>
              </header>

              {/* The settled phone: a second, STATIC instance — playback
                  disabled, top-anchored thread (see Phone variant="static").
                  Same size as section 1's phone on mobile (gate 75). Desktop
                  (change 14): height-driven via container units so the whole
                  device — last bubble, Delivered, home bar — stays inside
                  the snap frame (gates 30/34/83). */}
              <div
                data-save-phone-fit
                className="mx-auto mt-5 w-full max-w-[390px] min-[1100px]:mx-0 min-[1100px]:mt-0 min-[1100px]:min-h-0 min-[1100px]:flex-1"
              >
                <Phone preset={preset} bizName={bizName} variant="static" />
              </div>
            </div>

            {/* No justify-center here: auto margins center the stack when it
                fits but clamp to the TOP edge when it overflows, so the owner
                card can never spill above the reachable origin on short
                phones (change 12 review, lens 1 finding 1). */}
            <div data-panel className="flex min-h-0 flex-col px-1 min-[1100px]:px-0">
              <div data-save-stack className="relative my-auto w-full min-[1100px]:my-0">
                {/* The sub-headline, desktop only (change 14): moved out of
                    the left column so the phone's height budget closes at a
                    >=340px width. Same element contract as the mobile copy —
                    gate 33 accepts whichever [data-sub] is visible. */}
                <p data-sub className="mb-3 hidden text-[16px] leading-relaxed text-muted min-[1100px]:block">
                  {COPY.sub}
                </p>
                {/* The owner card: DOCKED statically in flow, 12px above the
                    panel at every width (change 13 flattens the old desktop
                    float — the right column owns its full height now). */}
                <div data-notify-ledger className="z-30 mx-auto mb-3 w-[min(92%,440px)]">
                  <NotifyCard bizName={bizName} entry={preset.caught[0]} />
                </div>
                <div data-ledger-panel className="w-full">
                  <Ledger preset={preset} bizName={bizName} />
                </div>
              </div>
            </div>
          </div>

          {/* Panel dots + the one-shot cue — the track exists below 1100 only. */}
          {/* The cue floats over the bleeding phone, so it rides a chip. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[108px] z-20 flex justify-center min-[1100px]:hidden">
            <p
              className={`rounded-full bg-abyss/80 px-3 py-1 text-[12px] text-muted backdrop-blur transition-opacity duration-500 ${
                saveCueGone ? "opacity-0" : "opacity-100"
              }`}
            >
              {COPY.cues.right}
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-[88px] z-20 flex justify-center gap-2.5 min-[1100px]:hidden">
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                data-panel-dot
                data-active={savePanel === i ? "true" : "false"}
                aria-label={`${COPY.a11y.panelDot} ${i + 1}`}
                onClick={() => goPanel(saveTrackRef.current, i)}
                className={panelDot(savePanel === i)}
              />
            ))}
          </div>
        </div>

        {/* Share (S2d): teal fill, bottom-center — full width on phones,
            centered under the two-up on desktop. */}
        <div className="absolute inset-x-6 bottom-5 z-30 flex flex-col items-center gap-2 min-[1100px]:bottom-6">
          {share === "manual" && (
            <input
              data-share-fallback
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={COPY.shareLabel}
              className="w-[min(80vw,360px)] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal-bright"
            />
          )}
          <button data-share type="button" onClick={onShare} className={shareFill}>
            {share === "copied" ? COPY.shareCopied : COPY.shareLabel}
          </button>
        </div>
      </section>

      {/* ---- SECTION 3 — make it yours (change 13 rebuild, S3a/b): each
           panel is a full composition — preset label, a LIVE-skinned phone
           top showing the contact header + thread[0], and three money tiles.
           This is the one section where the visitor watches their typed name
           land on a phone. ---- */}
      <section data-section="yours">
        <Glow />
        <SectionMark {...COPY.sections.yours} />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col px-6 pb-[76px] pt-[88px] min-[1100px]:px-10 min-[1100px]:pb-16 min-[1100px]:pt-24">
          <div className="shrink-0 max-w-md min-[1100px]:max-w-[520px]">
            <label className="block">
              <span className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.name.label}</span>
              <input
                data-name-input
                type="text"
                value={nameInput}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={COPY.name.placeholder}
                maxLength={MAX_NAME_LEN}
                autoComplete="off"
                className="mt-2 block w-full border-x-0 border-b border-t-0 border-solid border-line bg-transparent pb-1.5 font-display text-[22px] text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-teal"
              />
            </label>
            <p className="mt-1.5 text-[12px] text-muted">{COPY.name.hint}</p>
          </div>

          {/* The switcher IS the track: one panel per preset, snapping sets
              the preset for the whole page. */}
          <div ref={yoursTrackRef} data-track className="mt-3 min-h-0 w-full flex-1">
            {PRESETS.map((p) => {
              const panelName = p.id === preset.id ? bizName : p.bizName;
              return (
                <div
                  key={p.id}
                  data-panel
                  data-preset={p.id}
                  className="flex min-h-0 flex-col justify-center px-1 min-[1100px]:grid min-[1100px]:grid-cols-2 min-[1100px]:items-center min-[1100px]:gap-16 min-[1100px]:px-2"
                >
                  <p className="text-center font-display text-[28px] font-medium leading-tight text-ink min-[1100px]:hidden">
                    {p.label}
                  </p>

                  <div className="mx-auto mt-3 w-full max-w-[390px] min-[1100px]:mt-0">
                    <PhoneTop preset={p} bizName={panelName} />
                  </div>

                  <div className="mt-4 min-[1100px]:mt-0">
                    <p className="hidden font-display text-[28px] font-medium leading-tight text-ink min-[1100px]:block">
                      {p.label}
                    </p>
                    {/* Three money tiles (S3a/d): ticket gold, missed ink,
                        lost muted — exactly ONE gold element per panel, the
                        ticket value (gates 79/82). */}
                    <div className="mt-3 grid grid-cols-2 gap-2 min-[1100px]:mt-5 min-[1100px]:grid-cols-1 min-[1100px]:gap-3">
                      <div data-tile="ticket" className="rounded-xl border border-line bg-surface p-3 text-center min-[1100px]:p-5 min-[1100px]:text-left">
                        <span data-ticket data-tile-value className="font-display text-[28px] font-semibold text-gold lining-nums min-[1100px]:text-[56px]">
                          ${p.ticket}
                        </span>{" "}
                        <span className="text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.ticketSuffix}</span>
                      </div>
                      <div data-tile="missed" className="rounded-xl border border-line bg-surface p-3 text-center min-[1100px]:p-5 min-[1100px]:text-left">
                        <span data-tile-value className="font-display text-[28px] font-semibold text-ink lining-nums min-[1100px]:text-[56px]">
                          {p.missedPerMonth}
                        </span>{" "}
                        <span className="text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.missedSuffix}</span>
                      </div>
                      <div data-tile="lost" className="col-span-2 rounded-xl border border-line bg-surface p-3 text-center min-[1100px]:col-span-1 min-[1100px]:p-5 min-[1100px]:text-left">
                        <span data-tile-value className="font-display text-[28px] font-semibold text-muted lining-nums min-[1100px]:text-[56px]">
                          {usd(p.lost)}
                        </span>{" "}
                        <span className="text-[13px] text-muted min-[1100px]:text-[17px]">{COPY.yours.lostSuffix}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-12 z-20 flex justify-center">
            <p
              className={`rounded-full bg-abyss/80 px-3 py-1 text-[12px] text-muted backdrop-blur transition-opacity duration-500 ${
                yoursCueGone ? "opacity-0" : "opacity-100"
              }`}
            >
              {COPY.cues.presets}
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center gap-2.5">
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
      <section data-section="math" data-bottom-band className="border-t border-line bg-surface">
        <Glow />
        <SectionMark {...COPY.sections.math} />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col items-center justify-center gap-10 px-6 text-center min-[1100px]:gap-12">
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

      {/* ---- Progress dots: right edge, one per section (A3). ---- */}
      <div className="fixed right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-3 min-[1100px]:right-6">
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
    </main>
  );
}
