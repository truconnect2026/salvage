import Demo from "@/components/Demo";
import { COPY, resolvePreset } from "@/lib/client.config";

/*
 * Server component. The causal chain starts here:
 *   URL param -> preset -> (client) playback phase -> counters.
 *
 * Next 16 hands searchParams as a Promise; it must be awaited. Reading it
 * without awaiting yields a thenable, resolvePreset falls through to the
 * default, and every /?biz= link silently renders salon. Gates 9-11 cover that.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const preset = resolvePreset(sp.biz);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-14 min-[900px]:px-10 min-[900px]:py-20 min-[1100px]:pb-20 min-[1100px]:pt-4">
      {/* A — eyebrow, headline, sub.
          At >=1100px the phone+ledger pair must fit under 900px tall with no
          scroll (the pair alone is ~740px), so the hero is deliberately
          compact there: smaller single-line headline, sub hidden. Below that
          breakpoint scrolling is fine and the fuller hero stands. */}
      <header className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted">{COPY.eyebrow}</p>
        <h1 className="mt-5 min-[1100px]:mt-1 font-display font-medium leading-[1.06] min-[1100px]:leading-[1.15] text-ink [font-size:clamp(34px,6vw,58px)] min-[1100px]:text-[26px]">
          {COPY.headline}
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted min-[1100px]:hidden">
          {COPY.sub}
        </p>
      </header>

      {/* B-F — interactive island, server-rendered settled for the resolved preset */}
      <Demo initialPresetId={preset.id} />
    </main>
  );
}
