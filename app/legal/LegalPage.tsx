import { COPY } from "@/lib/client.config";

/*
 * change 50: /privacy and /terms — required for carrier (A2P 10DLC) text
 * registration and linked from every client's /go page and from /start.
 * Every word is lib/client.config.ts's LIVE_COPY.legal.
 */
export default function LegalPage({ doc }: { doc: { title: string; updated: string; sections: { h: string; p: string }[] } }) {
  return (
    <main data-legal className="min-h-svh bg-abyss px-6 pb-16 pt-12 text-ink">
      <article className="mx-auto w-full max-w-[640px]">
        <h1 className="font-display text-[44px] font-medium leading-[1.04] tracking-[-0.01em] text-ink">{doc.title}</h1>
        <p className="mt-2 text-[13px] text-muted">{doc.updated}</p>
        {doc.sections.map((s) => (
          <section key={s.h} className="mt-8">
            <h2 className="font-display text-[28px] font-medium leading-tight text-ink">{s.h}</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-ink">{s.p}</p>
          </section>
        ))}
        <p className="mt-12 text-[13px] text-muted">{COPY.close.builtBy}</p>
      </article>
    </main>
  );
}
