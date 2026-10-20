"use client";

/* change 48: sections 2-4 of the demo, split out of components/Demo.tsx
   VERBATIM so they load in their own chunk. The server renders them inside
   the page as before (the HTML is complete); the client never hydrates
   them with the page — Demo's <Deferred> keeps the server markup untouched
   until the visitor first scrolls or interacts, then imports this module and
   renders it in place. The playback engine paints these sections' DOM
   either way (it addresses nodes by data attribute, never by React). */

import { Fragment, useEffect, useRef, type CSSProperties, type RefObject } from "react";

import Ledger from "@/components/Ledger";
import Phone, { NotifyCard } from "@/components/Phone";
import { SectionMark, btnSecondary } from "@/components/demoParts";
import { COPY, MAX_NAME_LEN, type Preset } from "@/lib/client.config";
import { type LedgerDates } from "@/lib/dates";
import { usd } from "@/lib/format";
import { track } from "@/lib/track";

export type SectionProps = {
  preset: Preset;
  presetList: Preset[];
  bizName: string;
  liveName: string;
  nameInput: string;
  /* the committed (debounced) name — the math line's personal form */
  name: string;
  credit: 0 | 1;
  dates?: LedgerDates;
  hasPhoto: boolean;
  refDjl: boolean;
  smsHref: string;
  yoursPanel: number;
  yoursTrackRef: RefObject<HTMLDivElement | null>;
  onNameChange: (raw: string) => void;
  onLoop: () => void;
  goPanel: (track: HTMLElement | null, i: number) => void;
};

/* change 31 (2): ONE link treatment on the page — teal text over a 1px teal
   underline at 70%. The gold CTA pill is a button, not a link, and keeps its
   own tier; nothing else may invent a third style. */
const linkStyle =
  "text-teal-bright underline decoration-[rgba(44,199,182,0.7)] decoration-1 underline-offset-2 " +
  "outline-none focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2";

/* change 33 (D4): the trade glyphs — one per vertical, hand-written at
   1.5px in the panel's own accent. They DRAW themselves on panel entry
   (stroke-dashoffset, driven by the track observer). */
function TradeGlyph({ id }: { id: string }) {
  const d: Record<string, string[]> = {
    /* The scissors' two blades are their own groups so the gesture can
       close them about the pivot (change 34, D). */
    salon: ["M6 6l20 24M9.5 34.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M26 6L6 30M26.5 34.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
    home: [
      "M31 9.5a6.5 6.5 0 0 1-8.7 6.1L12 25.9a3.6 3.6 0 0 1-5.1-5.1L17.2 10.5A6.5 6.5 0 0 1 25.8 3l-4.3 4.3 1.6 5 5 1.6L32.4 9.6",
      "M9.2 23.6h.02",
    ],
    dental: [
      "M9 12.5c0-4 3-6.5 6-6.5 2 0 3 .8 4 .8s2-.8 4-.8c3 0 6 2.5 6 6.5 0 6-2.4 8.5-3.4 13.5-.6 3-1.1 5-2.6 5-1.7 0-2-3-2.4-6-.3-2-.6-3-1.6-3s-1.3 1-1.6 3c-.4 3-.7 6-2.4 6-1.5 0-2-2-2.6-5C11.4 21 9 18.5 9 12.5z",
    ],
    other: [
      "M8.6 6.5h5.2l2.4 6-3 2.2a17 17 0 0 0 8.1 8.1l2.2-3 6 2.4v5.2a2.2 2.2 0 0 1-2.4 2.2A25.5 25.5 0 0 1 6.4 8.9a2.2 2.2 0 0 1 2.2-2.4z",
    ],
  };
  const paths = d[id] ?? d.other;
  /* change 35 (C3) / change 36 (A6): the 240px watermark is gone — it was
     a decorative plane behind live figures. The glyph is 24px, inline to
     the right of the trade label, where it labels rather than decorates.
     The stroke is 1.5 RENDERED px: a 38-unit viewBox drawn at 24 scales
     0.6316x, so it is specified in viewBox units at 1.5 / 0.6316. It is set
     in user units and not with vector-effect on purpose — a non-scaling
     stroke lays its dash pattern out in device space, and change 34's
     draw-on sets --len from getTotalLength() in viewBox units, so the tail
     of every glyph would simply stop being drawn. */
  const HAIRLINE = 1.5 / (24 / 38);
  return (
    <svg
      data-trade-glyph={id}
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 38 38"
      fill="none"
      stroke="var(--accent, #2CC7B6)"
      strokeWidth={HAIRLINE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((p, i) => (
        /* Each path is its own gesture unit: the scissors move as two
           blades about the pivot, every other glyph as one body. */
        <g key={i} data-gesture={i} style={{ transformOrigin: "16px 30px", transformBox: "fill-box" }}>
          <path d={p} />
        </g>
      ))}
    </svg>
  );
}


export function SaveSection(props: SectionProps) {
  const { preset, presetList, bizName, liveName, nameInput, name, credit, dates, hasPhoto, refDjl, smsHref, yoursPanel, yoursTrackRef, onNameChange, onLoop, goPanel } = props;
  return (
    <>
      <SectionMark {...COPY.sections.save} />

      <div data-section-content className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col pb-[calc(64px+env(safe-area-inset-bottom))] pl-6 pr-6 pt-[60px] min-[1100px]:max-w-[1240px] min-[1100px]:px-12 min-[1100px]:pb-16 min-[1100px]:pt-[84px]">
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
              <h1 className="hidden max-w-3xl font-display font-medium leading-[1.08] tracking-[-0.01em] text-ink text-[26px] min-[1100px]:block min-[1100px]:text-[56px]">
                {COPY.headline.split(/(?<=\.)\s+/).map((line, i) => (
                  <span
                    key={line}
                    data-headline-line
                    className="block"
                    style={{ "--line-delay": `${i * 90}ms` } as CSSProperties}
                  >
                    {line}
                  </span>
                ))}
              </h1>
              {/* Mobile keeps the sub here; on desktop it lives in the
                  right column (change 14 — see data-save-stack below). */}
              {/* change 33 (C1): with the headline gone below 1100, the
                  sub IS the lead — Newsreader 24, ink. */}
              <p data-sub data-lead data-ink className="max-w-xl font-display text-[24px] font-medium leading-[1.15] tracking-[-0.01em] text-ink min-[1100px]:hidden">
                {COPY.sub}
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
                <NotifyCard bizName={bizName} entry={preset.caught[credit]} />
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
                    <Ledger preset={preset} bizName={bizName} dates={dates} credit={credit} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}

export function YoursSection(props: SectionProps) {
  const { preset, presetList, bizName, liveName, nameInput, name, credit, dates, hasPhoto, refDjl, smsHref, yoursPanel, yoursTrackRef, onNameChange, onLoop, goPanel } = props;
  /* change 48: section 3's own behaviour — the trade-glyph draw and the
     keyboard accommodation — moved here from Demo.tsx verbatim; the panel
     ref is this section's. The glyph that is active when the section goes
     live draws then, as it drew at hydration before. */
  const yoursPanelRef = useRef<HTMLDivElement>(null);
  const kbCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => kbCleanup.current?.(), []);

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

  /* change 33 (D4): the trade glyph unrolls the first time its panel lands.
     One shot per panel, off the track's own active-panel signal; reduced
     motion gets it already drawn. */
  const drawnGlyphs = useRef<Set<string>>(new Set());
  useEffect(() => {
    const root = yoursPanelRef.current;
    const p = presetList[yoursPanel];
    if (!root || !p || drawnGlyphs.current.has(p.id)) return;
    const svg = root.querySelector<SVGSVGElement>(
      '[data-panel][data-preset="' + p.id + '"] [data-trade-glyph]',
    );
    if (!svg) return;
    drawnGlyphs.current.add(p.id);
    svg.querySelectorAll("path").forEach((path) => {
      path.style.setProperty("--len", String(Math.ceil(path.getTotalLength())));
    });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    svg.setAttribute("data-drawn", "pending");
    requestAnimationFrame(() => requestAnimationFrame(() => svg.setAttribute("data-drawn", "run")));
    /* change 34 (D): ONE gesture, 400ms after the 600ms draw completes.
       WAAPI carries its own delay, so this needs no timer and no CSS loop;
       every keyframe list returns to identity. */
    const units = [...svg.querySelectorAll<SVGGElement>("[data-gesture]")];
    const KEY: Record<string, (i: number) => Keyframe[]> = {
      salon: (i) => [
        { transform: "rotate(0deg)" },
        { transform: `rotate(${i === 0 ? -12 : 12}deg)`, offset: 0.5 },
        { transform: "rotate(0deg)" },
      ],
      home: () => [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-18deg)", offset: 0.5 },
        { transform: "rotate(0deg)" },
      ],
      dental: () => [
        { transform: "translateY(0px)" },
        { transform: "translateY(-6px)", offset: 0.45 },
        { transform: "translateY(1.15px)", offset: 0.75 },
        { transform: "translateY(0px)" },
      ],
      other: () => [
        { transform: "rotate(0deg)" },
        { transform: "rotate(8deg)", offset: 0.2 },
        { transform: "rotate(-8deg)", offset: 0.45 },
        { transform: "rotate(8deg)", offset: 0.7 },
        { transform: "rotate(0deg)" },
      ],
    };
    const frames = KEY[p.id] ?? KEY.other;
    units.forEach((u, i) =>
      u.animate(frames(i), { duration: 400, delay: 1000, easing: "ease-in-out", fill: "none" }),
    );
  }, [yoursPanel, presetList]);

  return (
    <>
      {/* change 36 (A7): no band, no full-bleed plane. The trade colour
          gets ONE background in the whole page — a 22% tint of accentSoft
          over abyss, on the panel itself (see [data-panel] below). */}
      <SectionMark {...COPY.sections.yours} />

      <div
        ref={yoursPanelRef}
        data-yours-panel
        data-section-content
        className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col pb-[calc(64px+env(safe-area-inset-bottom))] pl-6 pr-6 pt-[112px] min-[1100px]:grid min-[1100px]:max-w-[1240px] min-[1100px]:grid-cols-2 min-[1100px]:grid-rows-[auto_minmax(0,1fr)] min-[1100px]:gap-x-12 min-[1100px]:px-12 min-[1100px]:pb-16 min-[1100px]:pt-[124px]"
      >
        {/* change 33 (D1/D3): the tab strip is the switcher's label —
            four trades under the folio, the active one accented and
            underlined; the swipe cue sits directly beneath it. */}
        <div data-tabs data-chrome="tabs" data-client-world role="tablist" aria-label={COPY.a11y.panelDot} className="col-span-full mb-2 flex shrink-0 flex-nowrap items-center gap-x-5 min-[1100px]:col-span-2 min-[1100px]:gap-x-6">
          {presetList.map((p, i) => (
            <button
              key={p.id}
              data-tab={p.id}
              role="tab"
              type="button"
              aria-selected={yoursPanel === i}
              onClick={() => goPanel(yoursTrackRef.current, i)}
              className={
                "shrink-0 whitespace-nowrap border-b-2 pb-1 text-[14px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2 " +
                (yoursPanel === i
                  ? "border-b-[var(--accent,#2CC7B6)] text-[var(--accent,#2CC7B6)]"
                  : "border-b-transparent text-muted hover:text-ink")
              }
            >
              {COPY.tabs[p.id as keyof typeof COPY.tabs] ?? p.label}
            </button>
          ))}
        </div>

        {/* change 35 (C2): the field spans the content column — a
            240px cage was what forced the 19px value and clipped the
            longer trade names. */}
        <div data-chrome="namefield" className="w-full shrink-0 min-[1100px]:col-start-1 min-[1100px]:row-start-1 min-[1100px]:max-w-[400px]">
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
                className={`mt-2 block w-full overflow-hidden text-ellipsis whitespace-nowrap border-x-0 border-b border-t-0 border-solid border-muted bg-transparent pb-1.5 font-display font-medium text-[24px] text-ink caret-teal outline-none transition-colors focus:border-teal focus-visible:outline-none min-[1100px]:text-[22px] ${
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
            className="order-3 mx-auto mt-2 min-h-0 w-full max-w-[390px] flex-1 overflow-hidden min-[1100px]:order-none min-[1100px]:col-start-1 min-[1100px]:row-start-2 min-[1100px]:mx-auto min-[1100px]:mt-2 min-[1100px]:h-full min-[1100px]:min-h-0 min-[1100px]:flex-none"
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
                  style={
                    {
                      "--accent": p.accent,
                      "--accent-soft": p.accentSoft,
                      "--accent-ink": p.accentInk,
                      /* change 40 (C): no plane of any kind — the ground is
                         abyss, and the trade colour lives in the active
                         tab, the label and the glyph only. */
                    } as CSSProperties
                  }
                >
                  <div data-panel-content className="flex min-h-0 flex-col">
                  {/* change 36 (A6/E1): the trade label with its 24px glyph
                      inline to the right. The HEAD is what shows in the
                      peek; the BODY is what does not. */}
                  <div data-panel-head className="flex items-center gap-2">
                    <TradeGlyph id={p.id} />
                    <p data-panel-label className="w-fit font-display text-[28px] font-medium leading-[1.02] tracking-[-0.01em] text-[var(--accent,#E9EEF4)] min-[1100px]:text-[44px]">{p.label}</p>
                  </div>
                  <div data-panel-body className="flex min-h-0 flex-col">
                  {/* change 19 (B9): the fourth preset explains itself. */}
                  {p.tagline && <p data-tagline className="relative mt-0.5 w-fit text-[13px] text-muted">{p.tagline}</p>}
                  {/* change 26 (E1) / change 36 (A4/A6): labeled rows —
                      the "Typical for this trade" head and the double
                      hairline under it are gone. Ticket stays the one
                      gold element per panel (gates 79/82). */}
                  <div className="relative mt-3 min-[1100px]:mt-5 min-[1100px]:flex min-[1100px]:min-h-0 min-[1100px]:flex-1 min-[1100px]:flex-col">
                    <div className="border-t border-line" aria-hidden="true" />
                    <div data-tile="ticket" className="flex items-baseline justify-between gap-3 border-b border-line py-2 min-[1100px]:flex-1 min-[1100px]:items-center min-[1100px]:py-8">
                      <span className="whitespace-nowrap text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.rows.ticket}</span>
                      <span data-ticket data-tile-value data-figure="hero" className="font-medium leading-none text-gold text-[32px] min-[1100px]:text-[96px]">
                        ${p.ticket}
                      </span>
                    </div>
                    <div data-tile="missed" className="flex items-baseline justify-between gap-3 border-b border-line py-2 min-[1100px]:flex-1 min-[1100px]:items-center min-[1100px]:py-8">
                      <span className="whitespace-nowrap text-[13px] text-ink min-[1100px]:text-[17px]">{COPY.yours.rows.missed}</span>
                      <span data-tile-value data-figure="hero" className="font-medium leading-none text-ink text-[32px] min-[1100px]:text-[96px]">
                        {p.missedPerMonth}
                      </span>
                    </div>
                    <div data-tile="lost" className="flex items-baseline justify-between gap-3 border-b border-line py-2 min-[1100px]:flex-1 min-[1100px]:items-center min-[1100px]:py-8">
                      <span className="whitespace-nowrap text-[13px] text-muted min-[1100px]:text-[17px]">{COPY.yours.rows.lost}</span>
                      <span data-tile-value data-figure="hero" className="font-medium leading-none text-muted text-[32px] min-[1100px]:text-[96px]">
                        {usd(p.lost)}
                      </span>
                    </div>
                  </div>
                  </div>
                  </div>
                </div>
              ))}
              {/* change 34 (E): trailing peek-width space, so the LAST
                  panel can still snap flush to the spine — without it the
                  track runs out of scroll and rests ~19px short. */}
              <div aria-hidden="true" data-track-tail className="h-full shrink-0 basis-[12%] min-[1100px]:hidden" />
            </div>
          </div>

          {/* change 36 (A6): the dot row, the cue and the "Scroll up to
              watch it as…" pointer are all gone. The tabs are the
              switcher, the 12% peek shows the next trade's own name, and
              the phone below is its own payoff. */}
        </div>

      </div>
    </>
  );
}

export function CloseSection(props: SectionProps) {
  const { preset, presetList, bizName, liveName, nameInput, name, credit, dates, hasPhoto, refDjl, smsHref, yoursPanel, yoursTrackRef, onNameChange, onLoop, goPanel } = props;
  return (
    <>
      <SectionMark {...COPY.sections.math} />

      {/* change 30 (F1/F2): flowed from the folio — folio bottom + 16 ->
          the 2px rule; mobile left-aligns on the spine like desktop. */}
      <div data-section-content className="relative z-10 mx-auto flex h-full w-full max-w-[1200px] flex-col items-start justify-start gap-4 pb-[calc(24px+env(safe-area-inset-bottom))] pl-6 pr-6 pt-[44px] text-left min-[1100px]:max-w-[1240px] min-[1100px]:items-stretch min-[1100px]:gap-14 min-[1100px]:px-12 min-[1100px]:pb-16 min-[1100px]:pt-[68px]">
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
                  <span data-math-numeral data-figure="hero" className="font-medium text-gold">
                    {preset.missedPerMonth}
                  </span>
                  {midPart}
                  <span data-math-numeral data-figure="hero" className="font-medium text-gold">
                    ${preset.ticket}
                  </span>
                  {tailPart}
                </p>
              );
            })()
          ) : (
            <p data-math className="mx-0 max-w-[20ch] font-display font-medium leading-[1.08] tracking-[-0.01em] text-ink [font-size:clamp(40px,6vw,72px)] min-[1100px]:max-w-none min-[1100px]:[font-size:112px] min-[1100px]:[text-wrap:balance]">
              {COPY.mathLead}{" "}
              <span data-math-numeral data-figure="hero" className="font-medium text-gold">
                {preset.missedPerMonth}
              </span>{" "}
              {COPY.mathMid}{" "}
              <span data-math-numeral data-figure="hero" className="font-medium text-gold">
                ${preset.ticket}
              </span>{" "}
              {COPY.mathTail}
            </p>
          )}
        </div>

        {/* change 36 (F2): the line that turns the arithmetic into a
            decision. It sits with the total, not with the pitch. */}
        <p data-accuse className="-mt-3 max-w-[24ch] font-display text-[24px] font-medium leading-[1.15] tracking-[-0.01em] text-ink min-[1100px]:-mt-8 min-[1100px]:text-[32px]">
          {COPY.close.accuse}
        </p>

        {/* change 21 (B): the close. change 26 (F3) drops since-install
            from this section; (G6) the ?ref=djl portfolio variant swaps
            the conversion block for the portfolio pitch — price, sms,
            and Calendly hidden. change 27 (B4): >=1100 the close is ROW 2
            of a two-row section — CTA block left, builtBy/loop/wordmark/
            stack right-aligned right. The ?ref=djl variant runs the same
            grid. */}
        <div className="flex w-full max-w-md flex-col items-start gap-2 text-left min-[1100px]:grid min-[1100px]:max-w-none min-[1100px]:grid-cols-[55fr_45fr] min-[1100px]:items-start min-[1100px]:gap-x-16">
          <div data-close-left className="flex w-full flex-col items-start gap-2">
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
              {/* change 36 (F3): the primary action is a TEXT. Booking a
                  call was the highest-friction thing on the page and it
                  was wearing the gold. The body carries the ask and, when
                  the visitor has typed one, their own business name. */}
              <a
                data-cta
                data-sms
                href={smsHref}
                onClick={() => track("cta_sms", { preset: preset.id })}
                className="inline-block rounded-full bg-gold px-8 py-3.5 text-[15px] font-semibold text-abyss outline-none focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 min-[1100px]:px-10 min-[1100px]:py-5 min-[1100px]:text-[20px]"
              >
                {COPY.close.ctaLabel}
              </a>
              <p data-cta-sub className="text-[14px] text-muted min-[1100px]:text-[19px]">
                {COPY.close.ctaSub}
              </p>
              {/* change 36 (F4): Calendly is the secondary path — a 14px
                  link, not a second pill. */}
              <a
                data-cta-book
                href={COPY.contact.calendly}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("cta_calendly", { preset: preset.id })}
                className={`text-[14px] ${linkStyle}`}
              >
                {COPY.close.bookLabel}
              </a>
              {/* change 30 (F4): figures mono, words sans — the approved
                  string split on its dollar figures. */}
              {/* change 33 (E1): two lines; figures mono, words sans. */}
              {[COPY.close.priceLine, COPY.close.priceLine2].map((line, li) => (
                <p key={li} data-price-line className="text-[14px] text-ink min-[1100px]:text-[18px]">
                  {line.split(/(\$[\d,]+)/).map((part, i) =>
                    /^\$[\d,]+$/.test(part) ? (
                      <span key={i} data-figure="data">{part}</span>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                </p>
              ))}
            </>
          )}
          </div>

          <div data-close-rule className="mt-1 w-full border-t border-line min-[1100px]:hidden" />

          <div data-close-right className="flex w-full flex-col items-start gap-1 text-left">

          {/* change 26 (F4): 56px portrait; the name and the wordmark both
              link home. */}
          <div data-builtby className="mt-1 flex items-center gap-3">
            {hasPhoto ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                data-builtby-photo
                src={COPY.contact.photo}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span
                data-builtby-photo
                className="flex h-12 w-12 items-center justify-center rounded-full bg-teal"
              >
                <span className="font-display text-[21px] font-semibold leading-none text-abyss">S</span>
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

          {/* change 40: the 44px control height is section 1's spec; the
              close's loop button keeps its 36px, or the close runs 7px past
              a 740 fold. Same stroke, same ink — one size down. */}
          <button data-loop data-chrome="loop" type="button" onClick={onLoop} className={btnSecondary.replace("h-11", "h-9")}>
            {COPY.close.loopLabel}
          </button>

          <p data-wordmark data-chrome="colophon" className="mt-1 text-[11px] uppercase text-muted">
            <a
              href={COPY.portfolio.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`font-figures ${linkStyle}`}
            >
              {COPY.chrome.og.wordmark}
            </a>
            <span className="normal-case"> · {COPY.footNote} <span data-fictional>{COPY.fictionalNote}</span></span>
          </p>
          {/* change 36: the stack credit is gone. F pins the builtBy row,
              the loop button and the wordmark line; the build's toolchain
              was the one noun in the colophon that nothing on the page
              needed, and the close was running past the fold. */}
          </div>
        </div>
      </div>
    </>
  );
}
