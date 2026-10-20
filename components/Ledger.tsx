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

/* change 18 (D2) / change 26 (D8) / change 35 (D2): the split-flap board.
   Every glyph gets its own TILE — surface-2 at 70%, r2, a 1px seam across
   the middle in the rule colour — and "$" and "," ride tiles too, because
   a board is tiles all the way across. No shared container behind them:
   the board is the tiles. The engine derives every mid-flight glyph and
   rotateX purely from the phase (paintFlaps in Demo.tsx). */
function FlapBoard({ value, compact }: { value: number; compact: boolean }) {
  const glyphs = usd(value).split("");
  return (
    <span
      data-leak-lost
      data-flap-board
      aria-live="off"
      className="inline-flex items-baseline gap-[2px]"
    >
      {glyphs.map((g, i) => {
        const digit = /\d/.test(g);
        return digit ? (
          <span
            key={i}
            data-flap="digit"
            data-figure="hero"
            className={`relative inline-flex justify-center overflow-hidden rounded-[2px] bg-surface-2/70 px-[3px] font-medium leading-[1.15] text-ember ${
              compact ? "text-[24px]" : "text-[32px] min-[1100px]:text-[32px]"
            }`}
          >
            <span data-flap-face style={{ display: "inline-block" }}>
              {g}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-line"
            />
          </span>
        ) : (
          <span
            key={i}
            data-flap="static"
            data-figure="hero"
            className={`relative inline-flex justify-center overflow-hidden rounded-[2px] bg-surface-2/70 px-[3px] font-medium leading-[1.15] text-ember ${
              compact ? "text-[24px]" : "text-[32px] min-[1100px]:text-[32px]"
            }`}
          >
            <span data-flap-face style={{ display: "inline-block" }}>
              {g}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-line"
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
  credit = 0,
}: {
  preset: Preset;
  bizName?: string;
  compact?: boolean;
  dates?: LedgerDates;
  /* change 43a.1: which caller Salvage caught this run. 1 means the owner
     ANSWERED the first caller and the second rang out — row [0] (the
     stamped insert) is the second caller, and the first caller is not in
     Salvage's list at all: an answered call earns no credit. The stored
     Recovered figure is shown as stored (no derived math). */
  credit?: 0 | 1;
}) {
  const [row0, ...rest] = credit === 1 ? preset.caught.slice(1) : preset.caught;
  const headerName = bizName ?? preset.bizName;
  const L = COPY.ledger;

  return (
    <div data-panel-content className="w-full">
      {/* change 36 (A5): "Your side", the request-time month line and the
          double hairline under them are gone. The lead above already says
          whose side this is; the business name alone carries the header. */}
      <div data-ledger-biz className="truncate text-[13px] text-muted">
        {headerName}
      </div>
      <div className="mt-1.5 border-t border-line" aria-hidden="true" />

      {/* D7/D12: the money block — Recovered 56px gold over its own double
          hairline; the flap board at 44px; labels centered on figures. The
          reply row left for the footnote (D6). */}
      <div data-money>
        {/* change 36 (D1/D3): Recovered is the hero at 64px; the count
            sits BENEATH it at 14px secondary rather than riding the label. */}
        <div data-ink className={`flex items-center justify-between gap-3 ${compact ? "py-1.5" : "pt-2"}`}>
          <p className="text-[14px] text-muted">{L.recoveredLabel}</p>
          <p className={`${compact ? "text-[24px]" : "text-[64px]"} font-medium leading-none`} aria-live="off">
            <span data-panel-recovered data-ledger-recovered data-figure="hero" className="text-gold">
              {usd(preset.recovered)}
            </span>
          </p>
        </div>
        {!compact && (
          <p data-calls-caught className="pb-2 text-right text-[14px] text-muted">
            {L.callsBooked.replace("{n}", String(preset.callsCaught))}
          </p>
        )}
        <div className="border-t border-line" aria-hidden="true" />
        <div data-ink className={`flex items-center justify-between gap-3 border-b border-line ${compact ? "py-1.5" : "py-2"}`}>
          <p className="text-[14px] text-muted">{L.lostLabel}</p>
          <FlapBoard value={preset.lost} compact={compact} />
        </div>
      </div>

      {/* The engine's settle announcements (change 26, G5): one polite node
          per count-up, written only when the figure lands. */}
      <span data-announce-recovered aria-live="polite" className="sr-only" />
      <span data-announce-leak aria-live="polite" className="sr-only" />

      <p data-ink className={`text-[13px] text-muted ${compact ? "mt-2" : "mt-2"}`}>{L.caughtLabel}</p>

      {/* change 36 (A5/D1): three rows, one rule between them. The column
          heads, the gutter line numbers, the "+n more" line and the reply
          footnote are gone — a three-row table labels itself. The OG card
          keeps every row it always had. */}
      <div className="mt-1">
        <CaughtRow index={0} entry={row0} compact={compact} date={dates?.rows[0]} />
        {rest.map((entry, i) => (
          <CaughtRow key={i + 1} index={i + 1} entry={entry} compact={compact} date={dates?.rows[i + 1]} />
        ))}
      </div>

      {/* Since-install: the ledger's LAST ruled row (change 18, C2). */}
      <div
        data-ink
        className={`flex items-baseline justify-between gap-3 border-b border-t border-line ${compact ? "mt-2 py-1.5" : "mt-1.5 py-1.5"}`}
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
          : "grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_auto]"
      } items-start gap-x-2 ${compact ? "py-1.5" : "pb-1.5 pt-6 min-[600px]:py-2"}`}
    >
      {/* change 36 (A5): the gutter line number is gone. */}
      {compact && <span />}
      <div className="min-w-0">
        <div
          data-caught-name={index}
          className={`truncate font-medium text-ink ${compact ? "text-[15px]" : "text-[13px] min-[1100px]:text-[14px]"}`}
        >
          {entry.name}
        </div>
        {/* change 27 (C1) / change 36 (A5): the number line is gone from
            the interactive table at every width; the OG card never had it. */}
      </div>
      <div data-caught-detail={index} className={`min-w-0 truncate text-muted max-[599.98px]:whitespace-normal ${compact ? "text-[17px]" : "text-[12px]"}`}>
        {entry.detail}
      </div>
      <div data-caught-amount={index} data-figure="data" className={`relative text-right text-ink min-[600px]:self-end ${compact ? "text-[15px]" : "text-[13px] min-[1100px]:text-[14px]"}`}>
        {usd(entry.amount)}
        {/* change 33 (C3): the stamp sits ABOVE this cell, right-aligned to
            it, bottom edge 4px clear of the figure's top — it certifies the
            amount without ever crossing it. Absolute: zero height impact. */}
        {isFirst && !compact && (
          <span
            data-stamp
            data-figure="data"
            className="absolute bottom-[calc(100%+4px)] right-0 inline-block whitespace-nowrap rounded-[4px] border border-[var(--accent,#2CC7B6)] bg-transparent px-1.5 text-[11px] tracking-[0.12em] text-[var(--accent,#74E9DC)]"
            style={{ transform: "rotate(-6deg)", opacity: 1 }}
          >
            {COPY.ledger.stamp}
          </span>
        )}
      </div>

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
    /* change 36 (A5/D1): THREE rows everywhere in the interactive panel —
       the fourth left with the "+n more" line that used to excuse it. The
       OG card still carries every row. */
    <div data-caught-row={index} className={`${index < 2 || compact ? "border-b border-line" : ""} ${compact ? "" : "border-l-2 border-l-transparent"} ${!compact && index >= 3 ? "hidden" : ""}`}>
      {cells}
    </div>
  );
}
