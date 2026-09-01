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
  compact = false,
}: {
  preset: Preset;
  /* Tighter, larger-type rendering for the OG thumbnail: legible at 500px
     wide beats "looks right at full size", and the frame is short on height. */
  compact?: boolean;
}) {
  const [row0, ...rest] = preset.caught;
  const L = COPY.ledger;

  const pad = compact ? "p-4" : "p-6";
  const tileValue = `mt-1.5 font-display font-semibold leading-none lining-nums ${
    compact ? "text-[28px]" : "text-[26px] min-[500px]:text-[30px]"
  }`;

  return (
    <div className={`w-full rounded-2xl border border-line bg-surface ${pad}`}>
      {/* Header: screen label, bizName + month, status pill right-aligned.
          screenLabel sits INSIDE the card's own padding, not above it, so the
          card's outer top edge lines up with the phone's — an external eyebrow
          here would push the panel down relative to the phone and break the
          "tops aligned" requirement. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{L.screenLabel}</p>
          <div data-ledger-biz className="mt-1 truncate font-body text-[16px] font-semibold text-ink">
            {preset.bizName}
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
        className={`grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] ${compact ? "mt-4" : "mt-6"}`}
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
          <p data-panel-recovered data-ledger-recovered className={`${tileValue} text-gold`}>
            {usd(preset.recovered)}
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
           * data-leak-lost: a second element carrying this attribute (the
           * phone-side "Still lost" card, kept unchanged, is the first and
           * the one every playback gate actually samples via
           * document.querySelector's first-match). This one exists only so
           * gate 20's region-scoped query (looking for data-leak-lost inside
           * the same [data-money] region as the recovered figure) finds a
           * match instead of crashing on a null element. It is static —
           * never written by the engine — same as before change 5.
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
      <p className={`text-[12px] uppercase tracking-[0.18em] text-muted ${compact ? "mt-4" : "mt-6"}`}>
        {L.caughtLabel}
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="divide-y divide-line">
          <CaughtRow index={0} entry={row0} compact={compact} />
          {rest.map((entry, i) => (
            <CaughtRow key={i + 1} index={i + 1} entry={entry} compact={compact} />
          ))}
        </div>
      </div>

      {!compact && <p className="mt-4 text-[12px] text-muted">{L.reviewNote}</p>}
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
  return (
    <div
      data-caught-row={index}
      className={`flex items-start gap-3 ${compact ? "px-3 py-2" : "px-4 py-3.5"}`}
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
        {!compact && <div className="mt-0.5 truncate text-[12px] text-muted">{entry.detail}</div>}
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
