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
    <main className="mx-auto w-full max-w-6xl px-5 py-14 min-[900px]:px-10 min-[900px]:py-20">
      {/* A — eyebrow, headline, sub */}
      <header className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted">{COPY.eyebrow}</p>
        <h1 className="mt-5 font-display font-medium leading-[1.06] text-ink [font-size:clamp(34px,6vw,58px)]">
          {COPY.headline}
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">{COPY.sub}</p>
      </header>

      {/* B-F — interactive island, server-rendered settled for the resolved preset */}
      <Demo initialPresetId={preset.id} />
    </main>
  );
}
