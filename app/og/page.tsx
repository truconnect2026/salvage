import Ledger from "@/components/Ledger";
import Phone from "@/components/Phone";
import { COPY, DEFAULT_PRESET, PRESETS } from "@/lib/client.config";

/*
 * Source composition for public/og.png: the two-up, phone + owner ledger.
 * Screenshotted at exactly 1200x630 @2x by scripts/shoot.mjs.
 * Regenerable; harmless to leave routed.
 *
 * Sized for a 500px-wide thumbnail, not for what looks right at 1200px: type
 * on the ledger side uses Ledger's compact variant (bigger, tighter) rather
 * than the interactive panel's own sizing.
 */
export default function OgFrame() {
  const base = PRESETS.find((p) => p.id === DEFAULT_PRESET) ?? PRESETS[0];
  /* Call card + the first business reply: the missed call and the save. */
  const cropped = { ...base, thread: base.thread.slice(0, 1) };

  return (
    <div className="relative h-[630px] w-[1200px] overflow-hidden">
      {/* Headline band */}
      <div className="absolute inset-x-16 top-8">
        <span aria-hidden="true" className="block h-px w-14 bg-gold" />
        <h1 className="mt-3 max-w-[1050px] font-display text-[38px] font-medium leading-[1.12] text-ink">
          {COPY.headline}
        </h1>
      </div>

      {/* Devices row */}
      <div className="absolute left-16 top-[168px] flex items-start gap-8">
        <Phone preset={cropped} screenMinHeight={360} />
        <div className="w-[660px]">
          <Ledger preset={base} compact />
        </div>
      </div>

      <p className="absolute bottom-6 left-16 text-[13px] uppercase tracking-[0.28em] text-muted">
        {COPY.chrome.og.wordmark}
      </p>
    </div>
  );
}
