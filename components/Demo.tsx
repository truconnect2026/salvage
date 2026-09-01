"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import Ledger from "@/components/Ledger";
import Phone, { NotifyCard } from "@/components/Phone";
import { COPY, MAX_NAME_LEN, PRESETS, SHARE_ORIGIN, resolveName, type Preset } from "@/lib/client.config";
import { usd } from "@/lib/format";
import {
  BEATS,
  BUBBLE_ENTER,
  BUBBLE_RISE,
  CAUGHT_ROW_RISE,
  CONTROLS_AT,
  CONTROLS_FADE,
  DELIVERED_AT,
  HEADLINE_AT,
  HEADLINE_DUR,
  HEADLINE_RISE,
  LOCK_COLLAPSE_DUR,
  LOCK_MISS_AT,
  LOOP_UNTIL,
  RING_PERIOD,
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

/* ---------------------------------------------------------------------------
 * The playback engine lives outside React on purpose. It is imperative DOM
 * animation, not state: one rAF loop owns the phase signal, and every animated
 * element derives from it — the lock screen, the phone thread, the owner
 * ledger panel, both notification cards, the headline, the shimmer. No
 * per-beat timers, no second clock, and only this loop ever writes
 * transform/opacity/display on these nodes. (The 150ms name debounce is an
 * input-coalescing timeout, not an animation clock — it drives React state,
 * never a frame.)
 * ------------------------------------------------------------------------- */

type Nodes = {
  callCard: HTMLElement | null;
  rows: HTMLElement[];
  typings: Map<number, HTMLElement>;
  delivered: HTMLElement | null;
  bizName: HTMLElement | null;
  threadArea: HTMLElement | null;
  leak: HTMLElement | null;
  controls: HTMLElement | null;
  ledgerPanel: HTMLElement | null;
  caughtRow0: HTMLElement | null;
  panelRecovered: HTMLElement | null;
  lock: HTMLElement | null;
  lockCall: HTMLElement | null;
  lockRing: HTMLElement | null;
  lockDim: HTMLElement | null;
  lockMissed: HTMLElement | null;
  headline: HTMLElement | null;
  notifyPhone: HTMLElement | null;
  notifyLedger: HTMLElement | null;
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
  setPresetId: (id: string) => void;
};

function collect(root: HTMLElement): Nodes {
  const typings = new Map<number, HTMLElement>();
  root.querySelectorAll<HTMLElement>("[data-typing]").forEach((el) => {
    typings.set(Number(el.dataset.typing), el);
  });
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  return {
    callCard: q("[data-call-card]"),
    rows: Array.from(root.querySelectorAll<HTMLElement>("[data-row]")),
    typings,
    delivered: q("[data-delivered]"),
    bizName: q("[data-biz-name]"),
    threadArea: q("[data-thread-area]"),
    leak: q("[data-leak-lost]"),
    controls: q("[data-controls]"),
    ledgerPanel: q("[data-ledger-panel]"),
    caughtRow0: q('[data-caught-row="0"]'),
    panelRecovered: q("[data-panel-recovered]"),
    lock: q("[data-lock]"),
    lockCall: q("[data-lock-call]"),
    lockRing: q("[data-lock-ring]"),
    lockDim: q("[data-lock-dim]"),
    lockMissed: q("[data-lock-missed]"),
    headline: q("[data-headline]"),
    notifyPhone: q("[data-notify-phone]"),
    notifyLedger: q("[data-notify-ledger]"),
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
  if (ctx.nodes.callCard) ctx.nodes.callCard.style.opacity = s;
  if (ctx.nodes.ledgerPanel) ctx.nodes.ledgerPanel.style.opacity = s;
}

/* One function, one clock. `t` is GLOBAL time (lock screen starts at 0);
   the pre-existing thread beats are thread-relative, offset by THREAD_START. */
function paintScene(ctx: Ctx, t: number) {
  const n = ctx.nodes;
  const tt = t - THREAD_START;

  /* --- The lock-screen beat (0 .. THREAD_START) --- */
  if (n.lock) {
    const lockOn = t < THREAD_START;
    n.lock.style.display = lockOn ? "flex" : "none";
    if (lockOn) {
      /* Crossfade to the thread: the lock is opaque, so fading it out IS the
         crossfade — the thread is simply revealed beneath. */
      n.lock.style.opacity = String(1 - clamp01((t - THREAD_FADE_AT) / THREAD_FADE_DUR));

      if (n.lockRing) {
        if (t < LOCK_MISS_AT) {
          const ph = ((t % RING_PERIOD) + RING_PERIOD) % RING_PERIOD / RING_PERIOD;
          n.lockRing.style.opacity = String(0.55 * (1 - ph));
          n.lockRing.style.transform = `scale(${1 + ph * 0.5})`;
        } else {
          n.lockRing.style.opacity = "0";
        }
      }

      const cp = easeOut(clamp01((t - LOCK_MISS_AT) / LOCK_COLLAPSE_DUR));
      if (n.lockCall) {
        n.lockCall.style.opacity = String(1 - cp);
        n.lockCall.style.transform = `translateY(${-36 * cp}px)`;
      }
      if (n.lockDim) n.lockDim.style.opacity = String(0.3 * cp);
      if (n.lockMissed) {
        const mp = clamp01((t - (LOCK_MISS_AT + 0.15)) / 0.35);
        n.lockMissed.style.opacity = String(mp);
        n.lockMissed.style.transform = `translateY(${(1 - mp) * 8}px)`;
      }
    }
  }

  /* --- The headline lands on the missed-call beat --- */
  if (n.headline) {
    const hp = easeOut(clamp01((t - HEADLINE_AT) / HEADLINE_DUR));
    n.headline.style.opacity = String(hp);
    n.headline.style.transform = `translateY(${(1 - hp) * HEADLINE_RISE}px)`;
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

  if (n.controls) {
    const c = clamp01((tt - CONTROLS_AT) / CONTROLS_FADE);
    n.controls.style.visibility = c > 0 ? "visible" : "hidden";
    n.controls.style.opacity = String(c);
  }

  /* --- The two-sided moment: the owner notification, both instances --- */
  const np = notifyPresence(t);
  if (n.notifyPhone) {
    n.notifyPhone.style.opacity = String(np);
    n.notifyPhone.style.transform = `translateY(${(1 - np) * 130}%)`;
  }
  if (n.notifyLedger) {
    n.notifyLedger.style.opacity = String(np);
    n.notifyLedger.style.transform = `translate(-50%, ${(1 - np) * -14}px)`;
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

/* Thread-relative zero == the lock screen's standing values: the leak has not
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

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const bizName = name || preset.bizName;
  const shareUrl = `${SHARE_ORIGIN}/${buildQuery(preset.id, name)}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const copyTimer = useRef<number | null>(null);
  const nameTimer = useRef<number | null>(null);

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

  /* Mount. Reduced motion means zero timers: the SSR settled state stands. */
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
      setPresetId,
    };
    ctxRef.current = ctx;

    if (ctx.reduced) {
      root.dataset.t = "settled";
      return;
    }

    paintScene(ctx, 0);
    paintFade(ctx, 1);
    paintNumbers(ctx, leakAt(0, preset.lost), panelRecoveredAt(0, preset.recovered, preset.caught[0].amount));
    root.dataset.t = "0.000";
    schedule(ctx);

    return () => {
      if (ctx.raf != null) cancelAnimationFrame(ctx.raf);
      ctx.raf = null;
    };
    // Mount only: `preset` seeds the context here and the effect above keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Section reveal (C5a): below-the-fold sections fade + rise once on first
     intersection. Elements above the fold at mount are never hidden, so
     there is no first-paint flash; with no JS nothing is ever hidden. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add("reveal-pending");
        io.observe(el);
      }
    });
    return () => io.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      if (nameTimer.current != null) window.clearTimeout(nameTimer.current);
    },
    [],
  );

  /* ---- interactions ---- */

  const syncUrl = (biz: string, committedName: string) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${buildQuery(biz, committedName)}${window.location.hash}`,
    );
  };

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
         id into the URL (review lens 2, finding 4). */
      const ctx = ctxRef.current;
      syncUrl(ctx?.transition?.to.id ?? ctx?.preset.id ?? presetId, clean);
    }, 150);
  };

  const onPreset = (id: string) => {
    const ctx = ctxRef.current;
    if (!ctx || id === preset.id) return;
    const next = PRESETS.find((p) => p.id === id);
    if (!next) return;

    /* Bail BEFORE any side effect. A click landing inside the 500ms swap is
       discarded for playback, so it must not commit ?biz= either: that would
       leave the address bar (and a reload) naming a preset the page never
       rendered, while Share still copied the one on screen. */
    if (!ctx.reduced && ctx.transition) return;

    /* Preset switch clears the name (B2): the incoming preset's own bizName
       shows, and the URL drops &name=. */
    if (nameTimer.current != null) window.clearTimeout(nameTimer.current);
    setNameInput("");
    setName("");
    syncUrl(id, "");

    setShare("idle");

    if (ctx.reduced) {
      setPresetId(id);
      return;
    }

    /* Roll from what is on screen now down to the incoming preset's beat-0
       values, so the counters never climb to a total they are about to drop.
       After the roll, ctx.start resets — playback restarts at the lock screen. */
    ctx.transition = {
      at: null,
      from: { ...ctx.shown },
      to: next,
      target: beatZeroTotals(next),
      swapped: false,
    };
    schedule(ctx);
  };

  const onReplay = () => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.reduced) return;
    /* Same policy as preset clicks: a click landing inside the 500ms swap is
       discarded. Nulling the transition before its half-point would cancel
       the un-committed setPresetId and leave the URL naming a preset that
       never renders (review lens 2, finding 2). */
    if (ctx.transition) return;
    ctx.transition = null;
    ctx.start = null;
    schedule(ctx);
  };

  const onShare = async () => {
    /* The copied link must match what the sender is about to see, not what
       React committed last: flush any pending name debounce, and resolve the
       preset from an in-flight swap's target (review lens 2, findings 1+3). */
    let committed = name;
    if (nameTimer.current != null) {
      window.clearTimeout(nameTimer.current);
      nameTimer.current = null;
      committed = resolveName(nameInput);
      setName(committed);
    }
    const bizId = ctxRef.current?.transition?.to.id ?? preset.id;
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

  return (
    <div ref={rootRef} data-demo data-t="settled">
      {/* The page order (change 10). Mobile: phone -> headline -> name +
          presets -> ledger; desktop: headline / name + presets / two-up —
          one named-area grid (.demo-grid, globals.css). Controls and the
          bottom band follow the grid at every width. On desktop the grid is
          the first full-viewport section, centered. */}
      <div className="demo-grid grid grid-cols-1 items-start min-[900px]:min-h-dvh min-[900px]:content-center min-[900px]:grid-cols-[288px_minmax(420px,1fr)] min-[900px]:gap-x-12 min-[900px]:gap-y-2 min-[1100px]:gap-x-16">
        {/* First frame: the phone. Nothing above it but the page's 24px
            padding on mobile (gate 57). */}
        <div className="[grid-area:phone] flex min-h-[calc(100dvh-48px)] flex-col min-[900px]:block min-[900px]:min-h-0">
          <Phone preset={preset} bizName={bizName} typingBefore={[0, 1, 2]} />
        </div>

        {/* The headline lands on the missed-call beat (A3): SSR ships it
            visible (the no-JS floor), the engine hides it before first paint
            and fades + rises it in at t=3.6. */}
        <header data-headline className="[grid-area:head] max-w-3xl pt-10 min-[900px]:pt-0">
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted">{COPY.eyebrow}</p>
          <h1 className="mt-4 min-[1100px]:mt-1 font-display font-medium leading-[1.06] min-[1100px]:leading-[1.15] text-ink [font-size:clamp(34px,6vw,58px)] min-[1100px]:text-[26px]">
            {COPY.headline}
          </h1>
          <p data-sub className="mt-4 min-[1100px]:mt-1.5 max-w-xl text-[16px] leading-relaxed text-muted">
            {COPY.sub}
          </p>
        </header>

        {/* Their name (B1) + the preset pills (B2). */}
        <div className="[grid-area:namepre] pb-12 pt-8 min-[900px]:py-0">
          <label className="block max-w-md">
            <span className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.name.label}</span>
            <input
              data-name-input
              type="text"
              value={nameInput}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={COPY.name.placeholder}
              maxLength={MAX_NAME_LEN}
              autoComplete="off"
              className="mt-2 min-[900px]:mt-1 block w-full border-x-0 border-b border-t-0 border-solid border-line bg-transparent pb-1.5 font-display text-[22px] text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-teal"
            />
          </label>
          <p className="mt-1.5 text-[12px] text-muted">{COPY.name.hint}</p>

          <div className="mt-6 min-[900px]:mt-2.5">
            <p className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.presetPrompt}</p>
            <div className="mt-3 min-[1100px]:mt-1.5 flex flex-wrap items-end gap-2.5 border-b border-line pb-1">
              {PRESETS.map((p) => {
                const active = p.id === preset.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-preset={p.id}
                    aria-pressed={active}
                    onClick={() => onPreset(p.id)}
                    className={`rounded-full border px-4 py-2 text-[13px] font-medium outline-none transition-colors duration-[220ms] focus-visible:ring-2 focus-visible:ring-teal-bright focus-visible:ring-offset-2 focus-visible:ring-offset-abyss ${
                      active
                        ? "border-teal bg-teal/10 text-teal-bright"
                        : "border-transparent text-muted underline-offset-4 hover:underline"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Owner side. On desktop the notification card also lands on this
            panel's top edge at the two-sided beat (A4). */}
        <div
          data-reveal
          className="[grid-area:ledger] flex min-h-dvh items-center py-10 min-[900px]:block min-[900px]:min-h-0 min-[900px]:py-0"
        >
          <div data-ledger-panel className="relative w-full">
            {/* No -translate-x-1/2 class here: Tailwind v4 compiles it to the
                independent `translate` property, which COMPOSES with the
                engine's inline transform instead of being overridden by it —
                the card would land double-shifted (review lens 3). The
                engine's translate(-50%, ...) owns centering; the inline
                opacity 0 seed keeps every pre-engine state invisible. */}
            <div
              data-notify-ledger
              className="absolute -top-4 left-1/2 z-30 hidden w-[min(92%,440px)] min-[900px]:block"
              style={{ opacity: 0, transform: "translate(-50%, -14px)" }}
            >
              <NotifyCard bizName={bizName} entry={preset.caught[0]} />
            </div>
            <Ledger preset={preset} bizName={bizName} />
          </div>
        </div>
      </div>

      {/* Controls + the bottom band: the closing section at every width. */}
      <div className="min-[900px]:flex min-[900px]:min-h-[40dvh] min-[900px]:flex-col min-[900px]:justify-center">
        <div data-reveal className="mt-10 min-[900px]:mt-0">
          <div data-controls className="flex min-h-[42px] flex-wrap items-center gap-3">
            <button data-replay type="button" onClick={onReplay} className={ghost}>
              {COPY.replayLabel}
            </button>
            <button data-share type="button" onClick={onShare} className={ghost}>
              {share === "copied" ? COPY.shareCopied : COPY.shareLabel}
            </button>
          </div>

          {share === "manual" && (
            <input
              data-share-fallback
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={COPY.shareLabel}
              className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal-bright"
            />
          )}
        </div>

        {/* Bottom band — math + CTA bound into one closing unit. bg-surface is
            one step lighter than the page ground (abyss). Gold is per-region
            (gate 38): the owner panel carries the recovered figure, this band
            carries the math numerals, nothing gold outside either. */}
        <div data-bottom-band data-reveal className="mt-16 border-t border-line bg-surface">
          <div className="flex flex-col gap-7 py-8 min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:justify-between min-[1100px]:gap-12 min-[1100px]:py-10">
            <p data-math className="max-w-lg text-[17px] leading-relaxed text-ink">
              {COPY.mathLead}{" "}
              <span data-math-numeral className="font-display text-[1.4em] font-semibold text-gold lining-nums">
                {preset.missedPerMonth}
              </span>{" "}
              {COPY.mathMid}{" "}
              <span data-math-numeral className="font-display text-[1.4em] font-semibold text-gold lining-nums">
                ${preset.ticket}
              </span>{" "}
              {COPY.mathTail}
            </p>

            <div className="min-[1100px]:shrink-0 min-[1100px]:text-right">
              <a
                href={COPY.ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-gold px-8 py-4 text-[15px] font-semibold text-abyss outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-abyss"
              >
                {COPY.ctaLabel}
              </a>
              <p className="mt-3 text-[12px] text-muted">{COPY.footNote}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
