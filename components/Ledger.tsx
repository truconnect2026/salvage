import { MissedCallGlyph } from "@/components/Phone";
import { COPY, type Preset } from "@/lib/client.config";
import { type LedgerDates } from "@/lib/dates";
import { usd } from "@/lib/format";

/**
 * The owner side, rebuilt as a LOG (change 18, C2/C3): 1px rules structure
 * every group — no card frame, no tiles, no pills. Money runs in Plex Mono
 * under the [data-figure] contract; the still-lost figure is a split-flap
 * board the playback engine drives off the one rAF phase.
 *
 * Row [0] of the caught table is the live link to the phone: the SAME
 * booking that closes the thread lands here the instant it closes. SSR
 * renders it fully settled (the no-JS floor); the engine hides it on mount
 * and slides it back in at CAUGHT_ROW_AT — never a second timer.
 */

/* change 18 (D2): the split-flap board. One flap per glyph of the settled
   figure — "$4,080" = 6 flaps, $ and comma static. SSR is the settled
   state; the ENGINE derives every mid-flight glyph and rotateX purely from
   the phase (see paintFlaps in Demo.tsx). Reduced motion never runs the
   engine, so the static figure stands. textContent of [data-leak-lost]
   concatenates to the plain figure, which is what the numeric gates read. */
function FlapBoard({ value, compact }: { value: number; compact: boolean }) {
  const glyphs = usd(value).split("");
  return (
    <span data-leak-lost data-flap-board className="inline-flex items-baseline gap-[2px]">
      {glyphs.map((g, i) => {
        const digit = /\d/.test(g);
        return (
          <span
            key={i}
            data-flap={digit ? "digit" : "static"}
            className={`relative inline-flex justify-center overflow-hidden rounded-[2px] bg-surface-2 px-[3px] font-medium leading-[1.15] text-ember ${
              compact ? "text-[24px]" : "text-[44px]"
            }`}
            data-figure
          >
            <span data-flap-face style={{ display: "inline-block" }}>
              {g}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-abyss/70"
            />
          </span>
        );
      })}
    </span>
  );
}

export default function Ledger({
  preset,
  bizName,
  compact = false,
  dates,
}: {
  preset: Preset;
  /* The effective business name (custom or preset default) — change 10's
     live name field re-skins this header without touching playback. */
  bizName?: string;
  /* Tighter rendering for the OG thumbnail: legible at 500px wide beats
     "looks right at full size", and the frame is short on height. */
  compact?: boolean;
  /* change 17 (D2): request-time month + row dates (America/New_York),
     computed server-side. The compact OG variant renders neither. */
  dates?: LedgerDates;
}) {
  const [row0, ...rest] = preset.caught;
  const headerName = bizName ?? preset.bizName;
  const L = COPY.ledger;

  /* change 18 (B4): ledger money runs 44px design-scale (the mobile
     transform-fit scales the whole log down together); OG compact stays
     thumbnail-tuned. */
  const figure = compact ? "text-[24px]" : "text-[44px]";

  return (
    <div data-panel-content className="w-full">
      {/* Header rule: screen label + bizName left, request-time month right
          in mono. No pill — the log needs no status jewelry (A3/A4). */}
      <div className="flex items-end justify-between gap-4 border-b border-line pb-2">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{L.screenLabel}</p>
          <div data-ledger-biz className="mt-0.5 truncate text-[16px] font-medium text-ink">
            {headerName}
          </div>
        </div>
        {!compact && dates && (
          <div data-ledger-month data-figure className="shrink-0 pb-0.5 text-[13px] text-muted">
            {dates.month}
          </div>
        )}
      </div>

      {/* The three money rows — ruled, figures right (C2/C3). */}
      <div data-money>
        <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
          <p className="text-[14px] text-muted">
            {L.recoveredLabel}
            {!compact && (
              <span data-calls-caught className="ml-2 hidden text-[12px] text-ink min-[500px]:inline">
                <span data-figure>{preset.callsCaught}</span> calls booked
              </span>
            )}
          </p>
          {/* The recovered figure keeps its gate attributes on the leaf span:
              the engine rewrites its textContent every frame. */}
          <p className={`${figure} font-medium leading-none`}>
            <span data-panel-recovered data-ledger-recovered data-figure className="text-gold">
              {usd(preset.recovered)}
            </span>
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
          <p className="text-[14px] text-muted">
            {L.lostLabel}
            {!compact && (
              <span className="ml-2 hidden text-[12px] text-ink min-[500px]:inline">
                <span data-figure>{preset.missedPerMonth}</span> rang out
              </span>
            )}
          </p>
          <FlapBoard value={preset.lost} compact={compact} />
        </div>

        <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
          <p className="text-[14px] text-muted">
            {L.replyLabel}
            {!compact && (
              <span className="ml-2 hidden text-[12px] text-muted min-[500px]:inline">{L.replyCaption}</span>
            )}
          </p>
          <p data-figure className={`${figure} font-medium leading-none text-ink`}>
            {L.replyValue}
          </p>
        </div>
      </div>

      {/* Caught table (C3): ruled rows, mono figures, amounts on one shared
          right edge. Desktop runs the four columns wide; mobile stacks
          number+detail left, amount+date right. */}
      <p className={`text-[13px] text-muted ${compact ? "mt-2" : "mt-3"}`}>{L.caughtLabel}</p>
      <div className={compact ? "mt-1" : "mt-1.5"}>
        <CaughtRow index={0} entry={row0} compact={compact} date={dates?.rows[0]} />
        {rest.map((entry, i) => (
          <CaughtRow key={i + 1} index={i + 1} entry={entry} compact={compact} date={dates?.rows[i + 1]} />
        ))}
      </div>

      {!compact && (
        <p className="mt-2 hidden text-[12px] text-muted min-[500px]:block">{L.reviewNote}</p>
      )}

      {/* Since-install: the ledger's LAST ruled row (C2), not a boxed strip. */}
      <div
        className={`flex items-baseline justify-between gap-3 border-b border-t border-line ${compact ? "mt-2 py-1.5" : "mt-2.5 py-2"}`}
      >
        <p className="text-[12px] text-muted">{L.sinceLabel}</p>
        <p data-since-strip className={`text-muted ${compact ? "text-[14px]" : "text-[13px]"}`}>
          <span data-since-calls data-figure>{preset.sinceCalls}</span> calls caught ·{" "}
          <span data-since-recovered data-figure className="font-medium text-ink">
            {usd(preset.sinceRecovered)}
          </span>{" "}
          recovered
        </p>
      </div>
    </div>
  );
}

function CaughtRow({
  index,
  entry,
  compact,
  date,
}: {
  index: number;
  entry: Preset["caught"][number];
  compact: boolean;
  /* change 17 (D2): the request-time date; the preset's stored date string
     is the no-dates fallback (OG compact never shows either). */
  date?: string;
}) {
  /* Row [0] is the call the phone just closed — SSR carries its highlight
     from the first paint, not only once the playback engine slides it in.
     The teal left rule and distinct ground survive the de-boxing (gate 39);
     change 20 recolors the rule to the vertical accent. */
  const isFirst = index === 0;

  return (
    <div
      data-caught-row={index}
      className={`flex items-start gap-3 border-b border-line py-1.5 ${compact ? "" : "min-[500px]:py-2"} ${
        isFirst ? "border-l-2 border-l-teal bg-surface pl-2" : ""
      }`}
    >
      <span className="mt-0.5 shrink-0 text-muted">
        <MissedCallGlyph />
      </span>
      {/* change 19 (B3): the NAME leads — a log of people, not numbers.
          Detail second; the phone number drops to a third mono line. */}
      <div className="min-w-0 flex-1">
        <div
          data-caught-name={index}
          className={`truncate font-medium text-ink ${compact ? "text-[15px]" : "text-[13px] min-[500px]:text-[14px]"}`}
        >
          {entry.name}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className={`truncate text-muted ${compact ? "text-[17px]" : "text-[12px]"}`}>{entry.detail}</span>
          {isFirst && !compact && (
            /* change 18 (D3): the SALVAGED stamp — a rubber stamp on the log
               entry, not a pill. The engine fades it in with the row insert
               (120ms); SSR seeds the settled state. */
            <span
              data-stamp
              data-figure
              className="shrink-0 rounded-[4px] border border-teal px-1.5 text-[11px] tracking-[0.12em] text-teal-bright"
              style={{ transform: "rotate(-3deg)", opacity: 1 }}
            >
              {COPY.ledger.stamp}
            </span>
          )}
        </div>
        {!compact && (
          <div data-caught-number={index} data-figure className="mt-0.5 text-[12px] text-muted">
            {entry.number}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div data-caught-amount={index} data-figure className={`text-ink ${compact ? "text-[15px]" : "text-[14px]"}`}>
          {usd(entry.amount)}
        </div>
        {!compact && (
          <div data-caught-date={index} data-figure className="mt-0.5 text-[11px] text-muted">
            {date ?? entry.date}
          </div>
        )}
      </div>
    </div>
  );
}
