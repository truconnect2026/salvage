import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import Demo from "@/components/Demo";
import { COPY, META, PRESETS, resolveName, resolvePreset } from "@/lib/client.config";
import { ledgerDates } from "@/lib/dates";

/*
 * Server component. The causal chain starts here:
 *   URL params -> preset + custom name -> (client) playback phase -> counters.
 *
 * Next 16 hands searchParams as a Promise; it must be awaited. Reading it
 * without awaiting yields a thenable, resolvePreset falls through to the
 * default, and every /?biz= link silently renders salon. Gates 9-11 cover
 * that; gate 54 covers the same failure mode for &name=.
 *
 * Change 12: Demo renders the <main data-pager> itself — the pager is the
 * page's one vertical scroller and its wiring (observers, keyboard, dots)
 * is client-side, so the server component only frames it.
 */
/* change 26 (G6): the ?ref=djl portfolio flag selects the DJL OG image —
   per-request metadata layered over the layout's. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  if (sp.ref !== "djl") return {};
  return {
    openGraph: {
      title: COPY.portfolio.ogHeadline,
      description: META.description,
      url: "/?ref=djl",
      siteName: "Salvage",
      type: "website",
      images: [{ url: "/og-djl.png", width: 1200, height: 630, alt: META.description }],
    },
    twitter: {
      card: "summary_large_image",
      title: COPY.portfolio.ogHeadline,
      description: META.description,
      images: ["/og-djl.png"],
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const preset = resolvePreset(sp.biz);
  const initialName = resolveName(sp.name);
  /* change 17 (D2): request-time ledger dates, America/New_York. Computed
     here — the one server component — and passed down so the client
     hydrates the same strings. */
  const dates = ledgerDates();
  /* change 26 (G6): the portfolio flag, server-read. */
  const refDjl = (Array.isArray(sp.ref) ? sp.ref[0] : sp.ref) === "djl";
  /* change 21 (B): /andy.jpg is a PLACEHOLDER path — until Andy drops the
     photo in public/, the builtBy row renders the teal S mark. Checked on
     the server so the client never 404-flashes a broken image. */
  const hasPhoto = existsSync(join(process.cwd(), "public", COPY.contact.photo));
  /* change 24 (lever 2): only the REQUESTED preset renders as markup; the
     other three travel as data in a JSON script tag (end of body — zero
     depth before the LCP element) and hydrate into the track client-side.
     ?biz=X coherence is untouched: the requested preset is the one fully
     rendered. */
  const activeIndex = Math.max(0, PRESETS.findIndex((p) => p.id === preset.id));
  const otherPresets = PRESETS.filter((p) => p.id !== preset.id);

  return (
    <>
      {/* Orientation guard (C4): landscape on a coarse-pointer device shows
          only this. Pure CSS gate in globals.css — no JS, no hydration. */}
      <div
        data-rotate-guard
        className="fixed inset-0 z-50 flex-col items-center justify-center gap-5 bg-abyss text-center"
      >
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-teal"
          aria-hidden="true"
        >
          <rect x="7" y="3" width="10" height="18" rx="2.5" />
          <path d="M20.5 8.5a9 9 0 0 1 0 7" />
          <path d="M19 17.5l1.5-2l2 1.5" />
        </svg>
        <p className="text-[15px] text-ink">{COPY.rotatePrompt}</p>
      </div>

      <Demo initialPreset={preset} activeIndex={activeIndex} initialName={initialName} dates={dates} hasPhoto={hasPhoto} refDjl={refDjl} />
      <script
        type="application/json"
        id="salvage-presets"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(otherPresets).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
