import { COPY, type Preset } from "@/lib/client.config";
import { type LedgerDates } from "@/lib/dates";
import { usd } from "@/lib/format";

/**
 * The owner side — the LOG (change 18), detailed into a real ledger table by
 * change 26 (D): a Newsreader title over a double hairline, a ruled
 * column-head row (Name · Booking · Amount · Date), line numbers in the
 * gutter, Recovered at 56px gold over its own double hairline, the
 * split-flap board at 44px, and the reply time demoted to a mono footnote.
 *
 * Row [0] is the live link to the phone: the SAME booking that closes the
 * thread lands here the instant it closes. change 26 (B4): it PUSHES rows
 * 1-3 down by its own height (engine-driven height + slide — no opacity
 * fade); SSR renders it settled at full height (the no-JS floor).
 */

/* change 18 (D2) / change 26 (D8): the split-flap board. Digit flaps abut
   (no gap), faces surface-2 with the 1px split; "$" and "," are STATIC
   glyphs — plain type, no flap chrome. The engine derives every mid-flight
   glyph and rotateX purely from the phase (paintFlaps in Demo.tsx). */
function FlapBoard({ value, compact }: { value: number; compact: boolean }) {
  const glyphs = usd(value).split("");
  return (
    <span
      data-leak-lost
      data-flap-board
      aria-live="off"
      className="inline-flex items-baseline"
    >
      {glyphs.map((g, i) => {
        const digit = /\d/.test(g);
        return digit ? (
          <span
            key={i}
            data-flap="digit"
            data-figure="hero"
            className={`relative inline-flex justify-center overflow-hidden px-[3px] font-medium leading-[1.15] text-ember ${
              compact ? "bg-surface-2 text-[24px]" : "text-[44px] min-[1100px]:bg-surface-2 min-[1100px]:text-[56px]"
            }`}
          >
            <span data-flap-face style={{ display: "inline-block" }}>
              {g}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-abyss/70"
            />
          </span>
        ) : (
          <span
            key={i}
            data-flap="static"
            data-figure="hero"
            className={`relative inline-flex justify-center overflow-hidden px-[3px] font-medium leading-[1.15] text-ember ${
              compact ? "bg-surface-2 text-[24px]" : "text-[44px] min-[1100px]:bg-surface-2 min-[1100px]:text-[56px]"
            }`}
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
  bizName?: string;
  compact?: boolean;
  dates?: LedgerDates;
}) {
  const [row0, ...rest] = preset.caught;
  const headerName = bizName ?? preset.bizName;
  const L = COPY.ledger;

  return (
    <div data-panel-content className="w-full">
      {/* D3: the panel title — Newsreader 24 ink over a double hairline;
          bizName + request-time month ride the title line. */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p data-panel-title className={`${compact ? "font-display text-[24px] font-medium leading-[1.05] tracking-[-0.01em] text-ink" : "text-[13px] text-muted min-[1100px]:font-display min-[1100px]:text-[24px] min-[1100px]:font-medium min-[1100px]:leading-[1.05] min-[1100px]:tracking-[-0.01em] min-[1100px]:text-ink"}`}>
            {L.screenLabel}
          </p>
          <div data-ledger-biz className="mt-0.5 truncate text-[13px] text-muted">
            {headerName}
          </div>
        </div>
        {!compact && dates && (
          <div data-ledger-month data-figure="data" className="shrink-0 pb-0.5 text-[13px] text-muted min-[1100px]:text-[14px]">
            {dates.month}
          </div>
        )}
      </div>
      <div className="hairline2 mt-1.5" aria-hidden="true" />

      {/* D7/D12: the money block — Recovered 56px gold over its own double
          hairline; the flap board at 44px; labels centered on figures. The
          reply row left for the footnote (D6). */}
      <div data-money>
        <div data-ink className={`flex items-center justify-between gap-3 ${compact ? "py-1.5" : "h-14 min-[1100px]:h-auto min-[1100px]:py-1.5"}`}>
          <p className="text-[14px] text-muted">
            {L.recoveredLabel}
            {!compact && (
              <span data-calls-caught className="ml-2 hidden text-[12px] text-ink min-[500px]:inline">
                <span data-figure="data">{preset.callsCaught}</span> calls booked
              </span>
            )}
          </p>
          <p className={`${compact ? "text-[24px]" : "text-[64px] min-[1100px]:text-[72px]"} font-medium leading-none`} aria-live="off">
            <span data-panel-recovered data-ledger-recovered data-figure="hero" className="text-gold">
              {usd(preset.recovered)}
            </span>
          </p>
        </div>
        <div className="hairline2" aria-hidden="true" />
        <div data-ink className={`flex items-center justify-between gap-3 border-b border-line ${compact ? "py-1.5" : "h-14 min-[1100px]:h-auto min-[1100px]:py-1.5"}`}>
          <p className="text-[14px] text-muted">
            {L.lostLabel}
            {!compact && (
              <span className="ml-2 hidden text-[12px] text-ink min-[500px]:inline">
                <span data-figure="data">{preset.missedPerMonth}</span> rang out
              </span>
            )}
          </p>
          <FlapBoard value={preset.lost} compact={compact} />
        </div>
      </div>

      {/* The engine's settle announcements (change 26, G5): one polite node
          per count-up, written only when the figure lands. */}
      <span data-announce-recovered aria-live="polite" className="sr-only" />
      <span data-announce-leak aria-live="polite" className="sr-only" />

      <p data-ink className={`text-[13px] text-muted ${compact ? "mt-2" : "mt-3"}`}>{L.caughtLabel}</p>

      {/* D4/D5: the table — gutter line numbers, ruled column heads. */}
      <div className={compact ? "mt-1" : "mt-1.5"}>
        <div
          data-ink
          data-col-heads
          className={`grid ${
            compact
              ? "grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1.3fr)_auto]"
              : "border-l-2 border-l-transparent grid-cols-[20px_minmax(0,0.8fr)_minmax(0,1.7fr)_auto] min-[600px]:grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1.3fr)_auto_76px]"
          } items-baseline gap-x-2 border-b border-line pb-1 text-[11px] tracking-[0.04em] text-muted`}
        >
          <span />
          <span data-figure="data">{L.cols.name}</span>
          <span data-figure="data">{L.cols.booking}</span>
          <span data-figure="data" className="text-right">{L.cols.amount}</span>
          {/* compact (the OG card) hides row dates — a labeled empty column
              would be worse than no column. change 27 (C1): below 600 the
              table runs Name · Booking · Amount only. */}
          {!compact && (
            <span data-figure="data" className="hidden text-right min-[600px]:inline">{L.cols.date}</span>
          )}
        </div>
        <CaughtRow index={0} entry={row0} compact={compact} date={dates?.rows[0]} />
        {rest.map((entry, i) => (
          <CaughtRow key={i + 1} index={i + 1} entry={entry} compact={compact} date={dates?.rows[i + 1]} />
        ))}
        {/* change 28 (D1): the desktop table runs 3 rows at 1x — the rest
            fold into a mono footnote. Mobile and the OG keep every row. */}
        {!compact && preset.caught.length > 3 && (
          <p data-more-rows data-figure="data" className="mt-1 hidden text-[12px] text-muted max-[599.98px]:block min-[1100px]:block">
            {L.moreRows.replace("{n}", String(preset.caught.length - 3))}
          </p>
        )}
      </div>

      {/* D6: the reply time, demoted to a mono footnote under the table. */}
      <p data-ink data-reply-foot data-figure="data" className="mt-1.5 hidden text-[12px] text-muted min-[600px]:block">
        {L.replyFoot}
      </p>

      {!compact && (
        <p data-ink className="mt-2 hidden text-[12px] text-muted min-[500px]:block">{L.reviewNote}</p>
      )}

      {/* Since-install: the ledger's LAST ruled row (change 18, C2). */}
      <div
        data-ink
        className={`flex items-baseline justify-between gap-3 border-b border-t border-line ${compact ? "mt-2 py-1.5" : "mt-2.5 py-2"}`}
      >
        <p className="text-[12px] text-muted">{L.sinceLabel}</p>
        <p data-since-strip className={`text-muted ${compact ? "text-[14px]" : "text-[13px] min-[1100px]:text-[14px]"}`}>
          <span data-since-calls data-figure="data">{preset.sinceCalls}</span> calls caught ·{" "}
          <span data-since-recovered data-figure="data" className="font-medium text-ink">
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
  date?: string;
}) {
  /* Row [0] is the call the phone just closed. change 26 (B4): the OUTER
     carries the engine-driven height (the push); the INNER slides down
     within it. SSR is the settled state. */
  const isFirst = index === 0;

  const cells = (
    <div
      {...(isFirst ? { "data-row0-inner": true } : {})}
      className={`grid ${
        compact
          ? "grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1.3fr)_auto]"
          : "grid-cols-[20px_minmax(0,0.8fr)_minmax(0,1.7fr)_auto] min-[600px]:grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1.3fr)_auto_76px]"
      } items-start gap-x-2 ${compact ? "py-1.5" : "pb-1.5 pt-6 min-[600px]:py-2"}`}
    >
      {/* D5: the gutter line number. */}
      <span data-figure="data" className="pt-0.5 text-[12px] leading-none text-muted">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div
          data-caught-name={index}
          className={`truncate font-medium text-ink ${compact ? "text-[15px]" : "text-[13px] min-[1100px]:text-[14px]"}`}
        >
          {entry.name}
        </div>
        {/* change 27 (C1): the number line leaves the mobile table. */}
        {!compact && (
          <div data-caught-number={index} data-figure="data" className="mt-0.5 hidden text-[12px] text-muted min-[600px]:block">
            {entry.number}
          </div>
        )}
      </div>
      <div data-caught-detail={index} className={`min-w-0 truncate text-muted max-[599.98px]:whitespace-normal ${compact ? "text-[17px]" : "text-[12px]"}`}>
        {entry.detail}
      </div>
      <div data-caught-amount={index} data-figure="data" className={`relative text-right text-ink ${compact ? "text-[15px]" : "text-[13px] min-[1100px]:text-[14px]"}`}>
        {usd(entry.amount)}
        {/* change 33 (C3): the stamp sits ABOVE this cell, right-aligned to
            it, bottom edge 4px clear of the figure's top — it certifies the
            amount without ever crossing it. Absolute: zero height impact. */}
        {isFirst && !compact && (
          <span
            data-stamp
            data-figure="data"
            className="absolute bottom-[calc(100%+4px)] right-0 inline-block whitespace-nowrap rounded-[4px] border border-[var(--accent,#2CC7B6)] bg-transparent px-1.5 text-[11px] tracking-[0.12em] text-[var(--accent,#74E9DC)] min-[600px]:bottom-auto min-[600px]:top-[-4px] min-[600px]:right-[-24px]"
            style={{ transform: "rotate(-6deg)", opacity: 1 }}
          >
            {COPY.ledger.stamp}
          </span>
        )}
      </div>
      {!compact && (
      <div className="hidden text-right min-[600px]:block">
        <div data-caught-date={index} data-figure="data" className="mt-0.5 text-[13px] text-muted min-[1100px]:text-[14px]">
          {date ?? entry.date}
        </div>
      </div>
      )}
    </div>
  );

  if (isFirst) {
    return (
      <div
        data-caught-row={0}
        data-client-world
        className="relative border-b border-line border-l-2 border-l-[var(--accent,#2CC7B6)] bg-surface"
      >
        {cells}
      </div>
    );
  }
  return (
    /* change 28 (D1): rows past the third leave the desktop render (the
       moreRows footnote carries the count); mobile and the OG keep them. */
    <div data-caught-row={index} className={`border-b border-line ${compact ? "" : "border-l-2 border-l-transparent"} ${!compact && index >= 3 ? "max-[599.98px]:hidden min-[1100px]:hidden" : ""}`}>
      {cells}
    </div>
  );
}
