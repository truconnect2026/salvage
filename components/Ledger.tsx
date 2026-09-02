import { MissedCallGlyph } from "@/components/Phone";
import { COPY, type Preset } from "@/lib/client.config";
import { usd } from "@/lib/format";

/**
 * The owner side. NOT a phone: a wider, shorter card, so the two surfaces read
 * as two different devices at a glance rather than a matched pair.
 *
 * Row [0] of the caught list is the live link to the phone: the SAME booking
 * that closes the thread lands here the instant it closes. SSR renders it
 * fully settled (the no-JS floor); the playback engine in Demo.tsx hides it on
 * mount and slides it back in at CAUGHT_ROW_AT, driven by the one shared rAF
 * loop — never a second timer.
 */
export default function Ledger({
  preset,
  bizName,
  compact = false,
}: {
  preset: Preset;
  /* The effective business name (custom or preset default) — change 10's
     live name field re-skins this header without touching playback. */
  bizName?: string;
  /* Tighter, larger-type rendering for the OG thumbnail: legible at 500px
     wide beats "looks right at full size", and the frame is short on height. */
  compact?: boolean;
}) {
  const [row0, ...rest] = preset.caught;
  const headerName = bizName ?? preset.bizName;
  const L = COPY.ledger;

  /* change 10: the desktop hero section gained the name field above the
     two-up while keeping the whole frame inside 900px, so the panel runs
     denser at >=1100px. Mobile and the OG compact variant are untouched. */
  const pad = compact ? "p-3" : "p-6 min-[1100px]:p-5";
  const tileValue = `mt-1.5 font-display font-semibold leading-none lining-nums ${
    compact ? "text-[24px]" : "text-[26px] min-[500px]:text-[30px]"
  }`;

  return (
    <div data-panel-content className={`w-full rounded-2xl border border-line bg-surface ${pad}`}>
      {/* Header: screen label, bizName + month, status pill right-aligned.
          screenLabel sits INSIDE the card's own padding, not above it, so the
          card's outer top edge lines up with the phone's — an external eyebrow
          here would push the panel down relative to the phone and break the
          "tops aligned" requirement. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{L.screenLabel}</p>
          <div data-ledger-biz className="mt-1 truncate font-body text-[16px] font-semibold text-ink">
            {headerName}
          </div>
          {!compact && <div className="mt-0.5 text-[12px] text-muted">{L.monthLabel}</div>}
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-teal/50 bg-teal/10 px-3 py-1 text-[11px] font-medium text-teal-bright">
          {L.statusLabel}
        </span>
      </div>

      {/* Three metric tiles */}
      <div
        data-money
        className={`grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] ${compact ? "mt-2" : "mt-6 min-[1100px]:mt-4"}`}
      >
        <div className={`rounded-xl border border-line bg-surface-2 ${compact ? "p-3" : "p-4"}`}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{L.recoveredLabel}</p>
          {/*
           * data-ledger-recovered: the ONLY gold recovered figure on the page
           * (change 5 deleted the phone-side card that used to carry this
           * attribute). Kept alongside data-panel-recovered — which the
           * playback engine and gates 26/28/31/32 already address — rather
           * than renaming it, so gates 2/13/20 (pre-existing, unchanged code)
           * still find it under its original name. One element, one write
           * path (panelRecoveredAt drives it); the two attributes are just
           * two names for the same node.
           */}
          {/* The recovered figure keeps its gate attributes on the INNER span:
              the engine rewrites its textContent every frame, which would
              destroy any children — so the shimmer overlay (change 10, C5c)
              lives beside it, not inside it. The overlay's computed color is
              inherited ink, never gold, so the gold census stays at one. */}
          <p className={`${tileValue} relative block overflow-hidden`}>
            <span data-panel-recovered data-ledger-recovered className="text-gold">
              {usd(preset.recovered)}
            </span>
            <span
              data-gold-shimmer
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: 0,
                transform: "translateX(-120%)",
                background:
                  "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.30) 50%, transparent 70%)",
              }}
            />
          </p>
          {!compact && (
            <p data-calls-caught className="mt-1.5 text-[12px] text-ink">
              {preset.callsCaught} calls booked
            </p>
          )}
        </div>

        <div className={`rounded-xl border border-line bg-surface-2 ${compact ? "p-3" : "p-4"}`}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{L.lostLabel}</p>
          {/*
           * data-leak-lost: the ONLY element carrying this attribute (change
           * 6 deleted the phone-side "Still lost" card that used to). The
           * playback engine's collect() queries this attribute directly, so
           * once the phone-side duplicate was gone it started binding here
           * automatically — the climbing animation needed no engine change
           * at all, just this element to land on.
           */}
          <p data-leak-lost className={`${tileValue} text-muted`}>
            {usd(preset.lost)}
          </p>
          {!compact && <p className="mt-1.5 text-[12px] text-ink">{preset.missedPerMonth} rang out</p>}
        </div>

        <div className={`rounded-xl border border-line bg-surface-2 ${compact ? "p-3" : "p-4"}`}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{L.replyLabel}</p>
          <p className={`${tileValue} text-ink`}>{L.replyValue}</p>
          {!compact && <p className="mt-1.5 text-[12px] text-muted">{L.replyCaption}</p>}
        </div>
      </div>

      {/* Caught list */}
      <p
        className={`text-[12px] uppercase tracking-[0.18em] text-muted ${compact ? "mt-2" : "mt-6 min-[1100px]:mt-4"}`}
      >
        {L.caughtLabel}
      </p>
      {/* rounded-tl-none: row [0]'s flush teal rule needs a square corner to
          land against, not the panel's usual rounded one. Spelled out per
          corner (never a bare `rounded-xl` plus an override) so the result
          doesn't depend on Tailwind's utility ordering in the stylesheet. */}
      <div
        className={`overflow-hidden rounded-tl-none rounded-tr-xl rounded-br-xl rounded-bl-xl border border-line ${compact ? "mt-1.5" : "mt-3"}`}
      >
        <div className="divide-y divide-line">
          <CaughtRow index={0} entry={row0} compact={compact} />
          {rest.map((entry, i) => (
            <CaughtRow key={i + 1} index={i + 1} entry={entry} compact={compact} />
          ))}
        </div>
      </div>

      {!compact && <p className="mt-4 min-[1100px]:mt-3 text-[12px] text-muted">{L.reviewNote}</p>}

      {/* Since-install strip: the panel's last element, closing the gap
          against the phone at >=1100px with a running total rather than
          empty space. Renders in both variants — the OG composite wants it
          too. The dollar figure is ink, deliberately not gold: gold stays
          reserved for the one recovered figure above (gates 31/38). */}
      <div
        className={`border-t border-line ${compact ? "mt-2 pt-1.5" : "mt-5 pt-4 min-[1100px]:mt-4 min-[1100px]:pt-3"}`}
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{L.sinceLabel}</p>
        <p data-since-strip className={`mt-1.5 text-muted ${compact ? "text-[14px]" : "text-[13px]"}`}>
          <span data-since-calls>{preset.sinceCalls}</span> calls caught ·{" "}
          <span data-since-recovered className="font-semibold text-ink">{usd(preset.sinceRecovered)}</span> recovered
        </p>
      </div>
    </div>
  );
}

function CaughtRow({
  index,
  entry,
  compact,
}: {
  index: number;
  entry: Preset["caught"][number];
  compact: boolean;
}) {
  /* Row [0] is the call the phone just closed — SSR carries its highlight
     from the first paint, not only once the playback engine slides it in. */
  const isFirst = index === 0;

  return (
    <div
      data-caught-row={index}
      className={`flex items-start gap-3 ${compact ? "px-3 py-2" : "px-4 py-3.5 min-[1100px]:py-2"} ${
        isFirst ? "border-l-2 border-l-teal bg-surface-3" : "bg-surface-2"
      }`}
    >
      <span className="mt-0.5 shrink-0 text-muted">
        <MissedCallGlyph />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`tabular-nums text-ink ${compact ? "text-[15px]" : "text-[14px] min-[500px]:text-[15px]"}`}
        >
          {entry.number}
        </div>
        {/* change 8: at 500px the caught rows read as four anonymous numbers
            unless the detail line itself is legible, so compact carries a
            ~40% larger size here than the interactive panel's 12px. The
            "Just now" tag is dropped in compact — decoration competing with
            that detail line for the same sliver of space loses. */}
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className={`truncate text-muted ${compact ? "text-[17px]" : "text-[12px]"}`}>{entry.detail}</span>
          {isFirst && !compact && (
            <span className="shrink-0 rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-bright">
              {COPY.ledger.justNow}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          data-caught-amount={index}
          className={`tabular-nums text-ink ${compact ? "text-[15px]" : "text-[14px]"}`}
        >
          {usd(entry.amount)}
        </div>
        {!compact && <div className="mt-0.5 text-[11px] text-muted">{entry.date}</div>}
      </div>
    </div>
  );
}
