/*
 * change 45: the front door's hand-drawn glyphs. 24-unit boxes, 1.5 stroke,
 * currentColor — the demo's drawing language. No icon library.
 *
 * Job glyphs are keyed by a semantic id; config's JOB_GLYPH maps each
 * approved job string to its id (change 45.1), so a reordered list keeps
 * every glyph on its own job and no copy string lives in this file. A key
 * with no drawing renders NOTHING — gate 223 (45g) holds every job matched,
 * so a missing or wrong glyph is red, never silently papered over.
 */
import type { ReactNode } from "react";

export function Glyph({ children, size = 24, stroke = 1.5, ...rest }: { children: ReactNode; size?: number; stroke?: number } & Record<string, unknown>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      {...rest}
    >
      {children}
    </svg>
  );
}

const ELSE = (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="8.4" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </>
);

const TOOTH =
  "M7 6.6c0-1.9 1.6-3.1 3.2-3.1.9 0 1.3.4 1.8.4s.9-.4 1.8-.4c1.6 0 3.2 1.2 3.2 3.1 0 3.4-1.4 4.9-2 7.8-.4 1.9-.7 3.3-1.6 3.3-1.1 0-1.2-1.9-1.4-3.6-.2-1.2-.4-1.9-1-1.9s-.8.7-1 1.9c-.2 1.7-.3 3.6-1.4 3.6-.9 0-1.2-1.4-1.6-3.3C8.4 11.5 7 10 7 6.6z";

const JOB: Record<string, ReactNode> = {
  /* plumbing */
  "pipe-burst": (
    <>
      <path d="M2.5 7h7.5v5H2.5M21.5 7H14v5h7.5" />
      <path d="M11.2 8.4l.9-1.6M12.8 10.6l1 1.4" />
      <path d="M12 14.6c-1.3 1.6-2 2.7-2 3.6a2 2 0 0 0 4 0c0-.9-.7-2-2-3.6z" />
    </>
  ),
  "water-heater": (
    <>
      <rect x="7" y="4" width="10" height="14.5" rx="2" />
      <path d="M10 4V2.2M14 4V2.2M8.6 18.5v2M15.4 18.5v2" />
      <path d="M12 15.6c-1.2-.7-1.6-1.8-.6-3.2.2.8.7 1.1 1 .8.7.8.7 1.8-.4 2.4z" />
    </>
  ),
  "drain": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.7 9.4h6.6M8 12h8M8.7 14.6h6.6" />
    </>
  ),
  "toilet": (
    <>
      <path d="M5.5 3.5h5v7h-5z" />
      <path d="M5.5 10.5h13a5.5 5.5 0 0 1-5.5 5.5H12l.8 4.5H8.2l.8-4.8A4.8 4.8 0 0 1 5.5 11z" />
    </>
  ),
  /* hvac */
  "thermostat": (
    <>
      <path d="M8.5 13.6V5.2a2 2 0 0 1 4 0v8.4a3.6 3.6 0 1 1-4 0z" />
      <circle cx="10.5" cy="16.6" r="1.3" fill="currentColor" stroke="none" />
      <path d="M18 4.2v5.6M15.6 5.6l4.8 2.8M20.4 5.6l-4.8 2.8" />
    </>
  ),
  "noise": (
    <>
      <path d="M3 8.5c1.5-1.6 3 1.6 4.5 0s3 1.6 4.5 0 3 1.6 4.5 0 3 1.6 4.5 0" />
      <path d="M3 12.5c1.5-1.6 3 1.6 4.5 0s3 1.6 4.5 0 3 1.6 4.5 0 3 1.6 4.5 0" />
      <path d="M3 16.5c1.5-1.6 3 1.6 4.5 0s3 1.6 4.5 0" />
    </>
  ),
  "wrench": (
    <path d="M20.6 6.6a4.6 4.6 0 0 1-6.1 4.3l-7.1 7.1a2.4 2.4 0 0 1-3.4-3.4l7.1-7.1a4.6 4.6 0 0 1 6-5.9l-3 3 1.1 3.3 3.3 1.1z" />
  ),
  "condenser": (
    <>
      <rect x="3.5" y="5" width="17" height="13.5" rx="1" />
      <circle cx="9.8" cy="11.75" r="4" />
      <path d="M9.8 8.4v6.7M6.5 11.75h6.6M16.5 8.5h2M16.5 11h2M16.5 13.5h2M6 18.5v2M18 18.5v2" />
    </>
  ),
  /* electrical */
  "power-out": (
    <>
      <path d="M3.5 11L12 4l8.5 7M5.6 9.4V20h12.8V9.4" />
      <path d="M12.6 10.2l-2.4 3.9h3.4l-2.4 3.9" />
    </>
  ),
  "breaker": (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="1" />
      <rect x="9.8" y="6.5" width="4.4" height="5.5" fill="currentColor" stroke="none" />
      <path d="M9.8 15.4h4.4M9.8 17.8h4.4" />
    </>
  ),
  "outlet": (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9.6 8.4v3.2M14.4 8.4v3.2" />
      <circle cx="12" cy="15.6" r="1.3" />
    </>
  ),
  "panel": (
    <>
      <rect x="3.5" y="3.5" width="11" height="17" rx="1" />
      <path d="M6.4 7.5h5.2M6.4 10.5h5.2M6.4 13.5h5.2M19 18.5V6M16.6 8.4L19 6l2.4 2.4" />
    </>
  ),
  /* roofing */
  "roof-leak": (
    <>
      <path d="M2.5 11L12 4l9.5 7" />
      <path d="M12 11.6c-1.6 2-2.5 3.3-2.5 4.5a2.5 2.5 0 0 0 5 0c0-1.2-.9-2.5-2.5-4.5z" />
    </>
  ),
  "storm": (
    <>
      <path d="M7 15.5a4 4 0 0 1 .4-8 5 5 0 0 1 9.6 1.3 3.4 3.4 0 0 1-.5 6.7" />
      <path d="M12.6 11.8l-2.1 3.6h3l-2.1 3.6" />
    </>
  ),
  "inspect": (
    <>
      <path d="M2.5 12.5L10 6.2l7.5 6.3" />
      <circle cx="15" cy="15" r="3.6" />
      <path d="M17.6 17.6l3.6 3.6" />
    </>
  ),
  "roof-new": (
    <>
      <path d="M2.5 12.5L12 4.5l9.5 8M5 11v8.5h14V11" />
      <path d="M8 14.2h8M8 16.9h8" />
    </>
  ),
  /* garage doors */
  "garage-stuck": (
    <>
      <path d="M3.5 20V9L12 4l8.5 5v11" />
      <path d="M7 20v-8.5h10V20M7 14.4h10M7 17.2h10M15 9.6l-6 0" />
      <path d="M9.5 12.6l5 6.2" />
    </>
  ),
  "spring": (
    <path d="M2.5 12h2l1.4-3 2 6 2-6 1.1 2.3M13 11.3l1.1-2.3 2 6 2-6 1.4 3h2" />
  ),
  "opener": (
    <>
      <rect x="5" y="3.5" width="8" height="17" rx="2" />
      <circle cx="9" cy="8.6" r="1.9" />
      <path d="M7.6 13.6h2.8M7.6 16.2h2.8M16 7.6a3.4 3.4 0 0 1 0 4.8M18.4 5.4a6.6 6.6 0 0 1 0 9.2" />
    </>
  ),
  "garage-new": (
    <>
      <rect x="4" y="5" width="16" height="15" rx="0.5" />
      <path d="M4 10h16M4 15h16M12 5v15" />
    </>
  ),
  /* salon */
  "syringe": (
    <g transform="rotate(-45 12 12)">
      <path d="M2 12h4M6 9.6h10.4v4.8H6zM9 9.6v1.8M12 9.6v1.8M16.4 12h3.2M19.6 9.6v4.8" />
    </g>
  ),
  "dye": (
    <>
      <path d="M12 3.5c-3 4-4.5 6.5-4.5 8.7a4.5 4.5 0 0 0 9 0c0-2.2-1.5-4.7-4.5-8.7z" />
      <path d="M6 20.5h12" />
    </>
  ),
  "face": (
    <>
      <path d="M12 3.5c3.6 0 6 3 6 7.2 0 4.8-2.7 9.8-6 9.8s-6-5-6-9.8c0-4.2 2.4-7.2 6-7.2z" />
      <circle cx="9.6" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
      <path d="M10 14.8c1.2.9 2.8.9 4 0" />
    </>
  ),
  "lash": (
    <>
      <path d="M3 12.5c2.5-4 5.5-6 9-6s6.5 2 9 6c-2.5 4-5.5 6-9 6s-6.5-2-9-6z" />
      <circle cx="12" cy="12.5" r="2.5" />
      <path d="M7.2 7.8L5.8 5.6M12 6.5V3.8M16.8 7.8l1.4-2.2" />
    </>
  ),
  /* dental */
  "tooth-chip": (
    <>
      <path d={TOOTH} />
      <path d="M12.4 4.4l-1.2 2.4 1.8 1.4-1.1 2.3" />
    </>
  ),
  "toothbrush": (
    <>
      <path d="M3.5 20.5l8.6-8.6" />
      <path d="M12.1 11.9l3.4-3.4 4 4-3.4 3.4z" />
      <path d="M14.4 6.4l.9-.9M16.6 8.6l.9-.9M18.8 10.8l.9-.9" />
    </>
  ),
  "filling": (
    <>
      <path d={TOOTH} />
      <circle cx="12" cy="8.2" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  "crown": (
    <>
      <path d="M5 9.4l3.4 3 3.6-5.2 3.6 5.2 3.4-3v5.8H5z" />
      <path d="M7.4 15.2v3.4c0 1.1.7 1.9 1.4 1.9s1.4-.8 1.4-1.9v-1.4h3.6v1.4c0 1.1.7 1.9 1.4 1.9s1.4-.8 1.4-1.9v-3.4" />
    </>
  ),
  /* other */
  "calendar-plus": (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="0.75" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.4v5.2M9.4 15h5.2" />
    </>
  ),
  "document": (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4M9 11.5h6M9 14.5h6M9 17.5h3.6" />
    </>
  ),
  "question": (
    <>
      <path d="M4 5h16v10.5h-8.5L7 19.5v-4H4z" />
      <path d="M10.2 8.6a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.6-.8 1.1v.4" />
      <circle cx="12" cy="13.6" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
};

/** The server keys each job by its STRING through config's JOB_GLYPH
    (lib/go-params.ts jobsFor) — never by its place in the list. */
export function jobGlyph(key: string): ReactNode | null {
  return key === "else" ? ELSE : (JOB[key] ?? null);
}

/* ---------- slot glyphs, drawn for a 32px box --------------------------- */

export const SLOT: Record<string, ReactNode> = {
  book: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="0.75" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <rect x="13.5" y="13" width="3.5" height="3.5" fill="currentColor" stroke="none" />
    </>
  ),
  text: (
    <>
      <path d="M3.5 5h17v11h-9.5l-4.5 3.8V16h-3z" />
      <path d="M7.5 9.2h9M7.5 12.2h5.5" />
    </>
  ),
  call: <path d="M7 3.6l2.5-.4 1.5 4.1-1.9 1.4a10.6 10.6 0 0 0 4.7 4.7l1.4-1.9 4.1 1.5-.4 2.5a2 2 0 0 1-2.1 1.7C11 16.8 6.2 12 5.3 5.7A2 2 0 0 1 7 3.6z" />,
  quote: (
    <>
      <path d="M3 8.2h4.2l1.6-2.7h6.4l1.6 2.7H21V19H3z" />
      <circle cx="12" cy="13.4" r="3.3" />
      <circle cx="17.8" cy="10.6" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  save: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="0.75" />
      <circle cx="9" cy="10.4" r="2.1" />
      <path d="M5.9 16.4c.6-1.7 1.7-2.5 3.1-2.5s2.5.8 3.1 2.5M14.5 9.6h3.5M14.5 12.6h3.5" />
    </>
  ),
  emergency: (
    <path d="M7 3.6l2.5-.4 1.5 4.1-1.9 1.4a10.6 10.6 0 0 0 4.7 4.7l1.4-1.9 4.1 1.5-.4 2.5a2 2 0 0 1-2.1 1.7C11 16.8 6.2 12 5.3 5.7A2 2 0 0 1 7 3.6z" />
  ),
  chevron: <path d="M9.5 6.5l5.5 5.5-5.5 5.5" />,
  back: <path d="M14.5 6.5L9 12l5.5 5.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  share: (
    <>
      <path d="M8.5 9H7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17 9h-1.5" />
      <path d="M12 14.5V3.5M8.6 6.9L12 3.5l3.4 3.4" />
    </>
  ),
};

/* ---------- the compass rose: the DJL seal language ---------------------
   Eight points (four long cardinal, four short ordinal), two keyline rings,
   and the seal's ring of 24 dots between them. North is the one filled
   point. Pure geometry, computed once. */
const r2 = (n: number) => Math.round(n * 100) / 100;
function rosePoint(cx: number, cy: number, deg: number, len: number, half: number): string {
  const a = (deg * Math.PI) / 180;
  const tip = [cx + len * Math.sin(a), cy - len * Math.cos(a)];
  const l = [cx + half * Math.sin(a - Math.PI / 2), cy - half * Math.cos(a - Math.PI / 2)];
  const r = [cx + half * Math.sin(a + Math.PI / 2), cy - half * Math.cos(a + Math.PI / 2)];
  return `M${r2(l[0])} ${r2(l[1])}L${r2(tip[0])} ${r2(tip[1])}L${r2(r[0])} ${r2(r[1])}L${cx} ${cy}z`;
}
const C = 28;
const LONG = [0, 90, 180, 270].map((d) => rosePoint(C, C, d, 19, 3.6));
const SHORT = [45, 135, 225, 315].map((d) => rosePoint(C, C, d, 11.5, 2.6));
const DOTS = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2;
  return [r2(C + 23.5 * Math.sin(a)), r2(C - 23.5 * Math.cos(a))];
});

export function CompassRose({ size = 56 }: { size?: number }) {
  return (
    <svg data-go-compass width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx={C} cy={C} r="26.5" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" />
      <circle cx={C} cy={C} r="20.5" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" />
      {DOTS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.7" fill="currentColor" fillOpacity="0.55" />
      ))}
      {SHORT.map((d, i) => (
        <path key={`s${i}`} d={d} stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      ))}
      {LONG.map((d, i) => (
        <path key={`l${i}`} d={d} stroke="currentColor" strokeWidth="1" strokeLinejoin="round" fill={i === 0 ? "currentColor" : "none"} />
      ))}
      <circle cx={C} cy={C} r="1.6" fill="currentColor" />
    </svg>
  );
}
