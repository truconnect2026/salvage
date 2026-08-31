import Phone from "@/components/Phone";
import { CHROME, COPY, DEFAULT_PRESET, PRESETS } from "@/lib/client.config";

/*
 * Source composition for public/og.png.
 * Screenshotted at exactly 1200x630 @2x by scripts/shoot.mjs.
 * Regenerable; harmless to leave routed.
 */
export default function OgFrame() {
  const base = PRESETS.find((p) => p.id === DEFAULT_PRESET) ?? PRESETS[0];
  const cropped = { ...base, thread: base.thread.slice(0, 2) };

  return (
    <div className="relative h-[630px] w-[1200px] overflow-hidden">
      {/* Phone, upright, cropped by the bottom edge of the frame. */}
      <div className="absolute left-[72px] top-[78px]">
        <Phone preset={cropped} screenMinHeight={620} />
      </div>

      <div className="absolute left-[540px] right-[72px] top-1/2 -translate-y-1/2">
        <span aria-hidden="true" className="block h-px w-16 bg-gold" />
        <h1 className="mt-7 font-display text-[58px] font-medium leading-[1.05] text-ink">
          {COPY.headline}
        </h1>
        <p className="mt-9 text-[14px] uppercase tracking-[0.28em] text-muted">
          {CHROME.og.wordmark}
        </p>
      </div>
    </div>
  );
}
