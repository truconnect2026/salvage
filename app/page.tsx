import Phone from "@/components/Phone";
import { CHROME, COPY, DEFAULT_PRESET, PRESETS } from "@/lib/client.config";
import { usd } from "@/lib/format";

export default function Home() {
  const preset = PRESETS.find((p) => p.id === DEFAULT_PRESET) ?? PRESETS[0];

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

      {/* B — preset row */}
      <section className="mt-10">
        <p className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.presetPrompt}</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {PRESETS.map((p) => {
            const active = p.id === DEFAULT_PRESET;
            return active ? (
              <button
                key={p.id}
                type="button"
                className="rounded-full border border-teal px-4 py-2 text-[13px] font-medium text-ink"
              >
                {p.label}
              </button>
            ) : (
              <button
                key={p.id}
                type="button"
                disabled
                title={CHROME.presets.disabledTitle}
                className="cursor-not-allowed rounded-full border border-line px-4 py-2 text-[13px] font-medium text-muted"
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-12 grid grid-cols-1 gap-12 min-[900px]:mt-16 min-[900px]:grid-cols-[390px_minmax(0,1fr)] min-[900px]:items-center min-[900px]:gap-16">
        {/* C — phone */}
        <Phone preset={preset} />

        <div className="flex flex-col gap-9">
          {/* D — ledger */}
          <section
            className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6"
            style={{ boxShadow: "0 0 44px -14px rgba(216,180,90,0.30)" }}
          >
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gold" />
            <p className="text-[12px] uppercase tracking-[0.18em] text-muted">{COPY.ledgerTitle}</p>
            <p
              data-ledger-recovered
              className="mt-2 font-display font-semibold leading-none text-gold lining-nums [font-size:clamp(46px,8vw,68px)]"
            >
              {usd(preset.recovered)}
            </p>
            <p data-calls-caught className="mt-3 text-[15px] text-ink">
              {preset.callsCaught} {CHROME.ledger.callsCaughtLabel}
            </p>
            <p className="mt-1.5 text-[13px] text-muted">{COPY.ledgerCaption}</p>
          </section>

          {/* E — math line */}
          <p data-math className="max-w-lg text-[17px] leading-relaxed text-ink">
            {COPY.mathLead}{" "}
            <span className="font-display text-[1.4em] font-semibold text-gold lining-nums">
              {preset.missedPerMonth}
            </span>{" "}
            {COPY.mathMid}{" "}
            <span className="font-display text-[1.4em] font-semibold text-gold lining-nums">
              ${preset.ticket}
            </span>{" "}
            {COPY.mathTail}
          </p>

          {/* F — CTA */}
          <div>
            <a
              href={COPY.ctaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full bg-gold px-8 py-4 text-[15px] font-semibold text-abyss"
            >
              {COPY.ctaLabel}
            </a>
            <p className="mt-3 text-[12px] text-muted">{COPY.footNote}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
