/**
 * change 17 (D2): the ledger's month and caught-row dates are COMPUTED at
 * request time in America/New_York — a hardcoded "March 2026" goes stale the
 * moment the demo outlives its month. Called from the server component
 * (app/page.tsx) once per request and passed down as props, so hydration
 * re-renders the exact same strings and the client clock never disagrees
 * with the server's.
 *
 * Row dates: row[0] is today; rows 1-3 are today minus 3 / 6 / 10 days,
 * with the day-of-month clamped to >= 1 so every row stays inside the
 * current month — the list is titled "Caught this month".
 */
export type LedgerDates = { month: string; rows: [string, string, string, string] };

const TZ = "America/New_York";

export function ledgerDates(now: Date = new Date()): LedgerDates {
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(now);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const y = num("year");
  const m = num("month");
  const day = num("day");

  /* The Date below is only a formatting vehicle for a (year, month, day) we
     already resolved in America/New_York — no timeZone option here, or the
     host's offset would shift the day we just clamped. */
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const rows = [0, 3, 6, 10].map((minus) => fmt.format(new Date(y, m - 1, Math.max(1, day - minus)))) as [
    string,
    string,
    string,
    string,
  ];

  return { month, rows };
}
