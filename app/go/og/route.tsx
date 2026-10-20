import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { GO_COPY } from "@/lib/client.config";
import { resolveGoParams, tradeLabel } from "@/lib/go-params";

/*
 * change 42: the /go link preview — what a missed-call text unfurls into.
 * A route handler, not app/go/opengraph-image: that convention never sees
 * the query string, and this card is nothing without the business name.
 * Same sanitizer as the page (resolveGoParams), so a crafted ?biz= renders
 * as text, capped, here too. Fonts are the page's own faces, as TTF.
 */
const FONT_DIR = join(process.cwd(), "app", "go", "og");
let fonts: Promise<[Buffer, Buffer, Buffer]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all([
    readFile(join(FONT_DIR, "Newsreader-Medium.ttf")),
    readFile(join(FONT_DIR, "IBMPlexSans-Medium.ttf")),
    readFile(join(FONT_DIR, "IBMPlexMono-Regular.ttf")),
  ]));

const W = 1200;
const H = 630;
const PAD = 72;

/* Satori cannot measure, so the size is a width estimate tuned on
   Newsreader 500 (~0.48em average glyph): the largest size that sets the
   name in two lines across the 1056px measure, capped at 148px. */
function nameSize(name: string) {
  const perLine = Math.max(...balancedLines(name).map((l) => l.length), 1);
  return Math.max(52, Math.min(148, Math.floor((W - PAD * 2) / (perLine * 0.48))));
}
function balancedLines(name: string): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [name];
  let best = [name, ""];
  let score = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const s = Math.max(a.length, b.length);
    if (s < score) {
      score = s;
      best = [a, b];
    }
  }
  return best;
}

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const p = resolveGoParams(sp);
  const trade = tradeLabel(p);
  const [serif, sans, mono] = await loadFonts();
  const size = nameSize(p.biz);
  const { accent, accentInk } = p.preset;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          background: "#060B14",
          padding: `${PAD - 8}px ${PAD}px ${PAD - 8}px`,
          fontFamily: "Plex Sans",
          color: "#E9EEF4",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 2, background: "#D8B45A" }} />
          {trade ? (
            <div style={{ fontFamily: "Plex Mono", fontSize: 26, letterSpacing: 4, color: accent, textTransform: "uppercase" }}>
              {trade}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
            fontFamily: "Newsreader",
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: -1,
            maxWidth: W - PAD * 2,
          }}
        >
          {p.biz}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              height: 104,
              padding: "0 40px 0 32px",
              borderRadius: 10,
              background: accent,
              color: accentInk,
              fontSize: 40,
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={accentInk} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="15.5" rx="0.75" />
              <path d="M3.5 9.5h17M8 3v4M16 3v4" />
              <rect x="13.5" y="13" width="3.5" height="3.5" fill={accentInk} stroke="none" />
            </svg>
            {GO_COPY.go.book}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, color: "#8AA0B4", paddingBottom: 6 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 5,
                background: "#2CC7B6",
                color: "#060B14",
                fontFamily: "Newsreader",
                fontSize: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              S
            </div>
            {GO_COPY.go.poweredBy}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Newsreader", data: serif, weight: 500, style: "normal" },
        { name: "Plex Sans", data: sans, weight: 500, style: "normal" },
        { name: "Plex Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
