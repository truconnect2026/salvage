"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import Ledger from "@/components/Ledger";
import Phone from "@/components/Phone";
import { COPY, PRESETS, SHARE_ORIGIN, type Preset } from "@/lib/client.config";
import { usd } from "@/lib/format";
import {
  BEATS,
  BUBBLE_ENTER,
  BUBBLE_RISE,
  CAUGHT_ROW_RISE,
  CONTROLS_AT,
  CONTROLS_FADE,
  DELIVERED_AT,
  LOOP_UNTIL,
  PHONE_SCREEN_HEIGHT,
  SWAP_FADE,
  SWAP_ROLL,
  TYPING,
  caughtRowProgress,
  clamp01,
  easeOut,
  leakAt,
  ledgerAt,
  panelRecoveredAt,
} from "@/lib/timeline";

/* ---------------------------------------------------------------------------
 * The playback engine lives outside React on purpose. It is imperative DOM
 * animation, not state: one rAF loop owns the phase signal, and every animated
 * element derives from it — on the phone AND on the owner ledger panel. No
 * per-bubble timers, no second clock, and only this loop ever writes
 * transform/opacity/display on these nodes.
 * ------------------------------------------------------------------------- */

type Nodes = {
  callCard: HTMLElement | null;
  rows: HTMLElement[];
  typings: Map<number, HTMLElement>;
  delivered: HTMLElement | null;
  bizName: HTMLElement | null;
  threadArea: HTMLElement | null;
  ledger: HTMLElement | null;
  leak: HTMLElement | null;
  controls: HTMLElement | null;
  ledgerPanel: HTMLElement | null;
  caughtRow0: HTMLElement | null;
  panelRecovered: HTMLElement | null;
};

type Totals = { recovered: number; lost: number; panelRecovered: number };
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
  return {
    callCard: root.querySelector<HTMLElement>("[data-call-card]"),
    rows: Array.from(root.querySelectorAll<HTMLElement>("[data-row]")),
    typings,
    delivered: root.querySelector<HTMLElement>("[data-delivered]"),
    bizName: root.querySelector<HTMLElement>("[data-biz-name]"),
    threadArea: root.querySelector<HTMLElement>("[data-thread-area]"),
    ledger: root.querySelector<HTMLElement>("[data-ledger-recovered]"),
    leak: root.querySelector<HTMLElement>("[data-leak-lost]"),
    controls: root.querySelector<HTMLElement>("[data-controls]"),
    ledgerPanel: root.querySelector<HTMLElement>("[data-ledger-panel]"),
    caughtRow0: root.querySelector<HTMLElement>('[data-caught-row="0"]'),
    panelRecovered: root.querySelector<HTMLElement>("[data-panel-recovered]"),
  };
}

function paintNumbers(ctx: Ctx, recovered: number, lost: number, panelRecovered: number) {
  ctx.shown = { recovered, lost, panelRecovered };
  if (ctx.nodes.ledger) ctx.nodes.ledger.textContent = usd(recovered);
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

function paintScene(ctx: Ctx, t: number) {
  const n = ctx.nodes;

  n.rows.forEach((row, i) => {
    const beat = BEATS[i] ?? 0;
    if (t < beat) {
      row.style.display = "none";
      return;
    }
    row.style.display = "flex";
    const p = easeOut(clamp01((t - beat) / BUBBLE_ENTER));
    row.style.opacity = String(p);
    row.style.transform = `translateY(${(1 - p) * BUBBLE_RISE}px)`;
  });

  TYPING.forEach((spec) => {
    const el = n.typings.get(spec.before);
    if (!el) return;
    const on = t >= spec.at && t < (BEATS[spec.before] ?? 0);
    el.style.display = on ? "flex" : "none";
    if (!on) return;
    el.querySelectorAll<HTMLElement>("[data-dot]").forEach((dot, d) => {
      const ph = (((t * 1.5 - d * 0.16) % 1) + 1) % 1;
      dot.style.opacity = String(0.3 + 0.7 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2)));
    });
  });

  if (n.delivered) n.delivered.style.display = t >= DELIVERED_AT ? "block" : "none";

  /* The owner-side caught row. It never toggles display: it always occupies
     its slot in the list (so the list's height is reserved from t=0 and never
     reflows), only opacity/transform animate as it "slides in". */
  if (n.caughtRow0) {
    const p = caughtRowProgress(t);
    n.caughtRow0.style.opacity = String(p);
    n.caughtRow0.style.transform = `translateY(${(1 - p) * CAUGHT_ROW_RISE}px)`;
  }

  if (n.controls) {
    const c = clamp01((t - CONTROLS_AT) / CONTROLS_FADE);
    n.controls.style.visibility = c > 0 ? "visible" : "hidden";
    n.controls.style.opacity = String(c);
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
        Math.round(tr.from.recovered + (tr.target.recovered - tr.from.recovered) * rp),
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
  const p = ctx.preset;

  paintScene(ctx, t);
  paintFade(ctx, 1);
  paintNumbers(
    ctx,
    ledgerAt(t, p.recovered),
    leakAt(t, p.lost),
    panelRecoveredAt(t, p.recovered, p.caught[0].amount),
  );
  ctx.root.dataset.t = t.toFixed(3);

  if (t < LOOP_UNTIL) schedule(ctx);
}

/* ------------------------------------------------------------------------- */

const settledTotals = (p: Preset): Totals => ({
  recovered: p.recovered,
  lost: p.lost,
  panelRecovered: p.recovered,
});

const beatZeroTotals = (p: Preset): Totals => ({
  recovered: ledgerAt(0, p.recovered),
  lost: leakAt(0, p.lost),
  panelRecovered: panelRecoveredAt(0, p.recovered, p.caught[0].amount),
});

const ghost =
  "rounded-full border border-teal px-5 py-2.5 text-[13px] font-medium text-teal-bright " +
  "transition-colors hover:bg-teal/10 outline-none " +
  "focus-visible:ring-2 focus-visible:ring-teal-bright focus-visible:ring-offset-2 focus-visible:ring-offset-abyss";

export default function Demo({ initialPresetId }: { initialPresetId: string }) {
  const [presetId, setPresetId] = useState(initialPresetId);
  const [share, setShare] = useState<"idle" | "copied" | "manual">("idle");

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const shareUrl = `${SHARE_ORIGIN}/?biz=${preset.id}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const copyTimer = useRef<number | null>(null);

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
      paintNumbers(ctx, ctx.shown.recovered, ctx.shown.lost, ctx.shown.panelRecovered);
    }
  }, [preset]);

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
    paintNumbers(ctx, 0, 0, panelRecoveredAt(0, preset.recovered, preset.caught[0].amount));
    root.dataset.t = "0.000";
    schedule(ctx);

    return () => {
      if (ctx.raf != null) cancelAnimationFrame(ctx.raf);
      ctx.raf = null;
    };
    // Mount only: `preset` seeds the context here and the effect above keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /* ---- interactions ---- */

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

    const url = new URL(window.location.href);
    url.searchParams.set("biz", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    setShare("idle");

    if (ctx.reduced) {
      setPresetId(id);
      return;
    }

    /* Roll from what is on screen now down to the incoming preset's beat-0
       values, so the counters never climb to a total they are about to drop. */
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
    ctx.transition = null;
    ctx.start = null;
    schedule(ctx);
  };

  const onShare = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl);
      setShare("copied");
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setShare("idle"), 2000);
    } catch {
      setShare("manual");
    }
  };

  return (
    <div ref={rootRef} data-demo data-t="settled">
      {/* B — preset row */}
      <section className="mt-10 min-[1100px]:mt-3">
        <p className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.presetPrompt}</p>
        <div className="mt-3 min-[1100px]:mt-1.5 flex flex-wrap gap-2.5">
          {PRESETS.map((p) => {
            const active = p.id === preset.id;
            return (
              <button
                key={p.id}
                type="button"
                data-preset={p.id}
                aria-pressed={active}
                onClick={() => onPreset(p.id)}
                className={`rounded-full border px-4 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal-bright focus-visible:ring-offset-2 focus-visible:ring-offset-abyss ${
                  active
                    ? "border-teal text-ink"
                    : "border-line text-muted hover:border-teal/60 hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* C + owner ledger — the two-up. Tops aligned; stacks below 900px. */}
      <div className="mt-12 grid grid-cols-1 items-start gap-10 min-[900px]:mt-16 min-[900px]:grid-cols-[390px_minmax(260px,1fr)] min-[900px]:gap-12 min-[1100px]:mt-3 min-[1100px]:grid-cols-[390px_minmax(420px,1fr)] min-[1100px]:gap-16">
        <div>
          {/* Phone (customer side) */}
          <Phone preset={preset} screenHeight={PHONE_SCREEN_HEIGHT} typingBefore={[0, 1, 2]} />

          {/* Controls. Space is reserved so their arrival shifts nothing. */}
          <div data-controls className="mt-5 flex min-h-[42px] flex-wrap items-center gap-3">
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

          {/* Quick pitch: what this is costing you, right under the phone. */}
          <div data-money className="mt-6 grid grid-cols-1 gap-4 min-[560px]:grid-cols-2">
            <section
              className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6"
              style={{ boxShadow: "0 0 44px -14px rgba(216,180,90,0.30)" }}
            >
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gold" />
              <p className="text-[12px] uppercase tracking-[0.18em] text-muted">
                {COPY.ledgerTitle}
              </p>
              <p
                data-ledger-recovered
                className="mt-2 font-display font-semibold leading-none text-gold lining-nums [font-size:clamp(42px,7vw,60px)]"
              >
                {usd(preset.recovered)}
              </p>
              <p data-calls-caught className="mt-3 text-[15px] text-ink">
                {preset.callsCaught} {COPY.chrome.ledger.callsCaughtLabel}
              </p>
              <p className="mt-1.5 text-[13px] text-muted">{COPY.ledgerCaption}</p>
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-line" />
              <p className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.leakTitle}</p>
              <p
                data-leak-lost
                className="mt-2 font-display font-semibold leading-none text-muted lining-nums [font-size:clamp(42px,7vw,60px)]"
              >
                {usd(preset.lost)}
              </p>
              <p className="mt-1.5 text-[13px] text-muted">{COPY.leakCaption}</p>
            </section>
          </div>
        </div>

        {/* Owner side */}
        <div data-ledger-panel>
          <Ledger preset={preset} />
        </div>
      </div>

      {/* Below the pair — math + CTA */}
      <div className="mt-14 flex flex-col gap-9 min-[900px]:mt-16">
        <p data-math className="max-w-lg text-[17px] leading-relaxed text-ink">
          {COPY.mathLead}{" "}
          <span className="font-display text-[1.4em] font-semibold text-gold lining-nums">
            {preset.missedPerMonth}
          </span>{" "}
          {COPY.mathMid}{" "}
          <span className="font-display text-[1.4em] font-semibold text-gold lining-nums">
            ${preset.ticket}
          </span>{" "}
          {COPY.mathTail}
        </p>

        <div>
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
  );
}
