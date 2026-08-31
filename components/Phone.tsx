import { Fragment } from "react";

import { COPY, type Preset } from "@/lib/client.config";

/* Hand-written status glyphs. No emoji, no icon library. */

function SignalGlyph() {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
      <path d="M0 7.6h2.6V11H0z" />
      <path d="M4.8 5.4h2.6V11H4.8z" />
      <path d="M9.6 2.9h2.6V11H9.6z" />
      <path d="M14.4 0h2.6v11h-2.6z" />
    </svg>
  );
}

function WifiGlyph() {
  return (
    <svg
      width="16"
      height="12"
      viewBox="0 0 16 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M0.9 3.5A9 9 0 0 1 15.1 3.5" />
      <path d="M3.5 6.1A6 6 0 0 1 12.5 6.1" />
      <path d="M6 8.7A3 3 0 0 1 10 8.7" />
      <path d="M8 10.6a1 1 0 0 1 0 1.4a1 1 0 0 1 0-1.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BatteryGlyph() {
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true">
      <path
        d="M3.4 0.7h14.9a2.7 2.7 0 0 1 2.7 2.7v5.2a2.7 2.7 0 0 1-2.7 2.7H3.4a2.7 2.7 0 0 1-2.7-2.7V3.4A2.7 2.7 0 0 1 3.4 0.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.55"
      />
      <path
        d="M3.6 2.6h11.1a1.4 1.4 0 0 1 1.4 1.4v4a1.4 1.4 0 0 1-1.4 1.4H3.6a1.4 1.4 0 0 1-1.4-1.4V4a1.4 1.4 0 0 1 1.4-1.4z"
        fill="currentColor"
      />
      <path d="M22.4 4.1c1.3 0.5 1.3 3.3 0 3.8z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/* Typing indicator. Hidden in SSR and under reduced motion; the rAF loop is the
   only thing that ever shows it, by writing inline display. */
function TypingRow({ index, right }: { index: number; right: boolean }) {
  return (
    <div data-typing={index} className={`hidden ${right ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex items-center gap-[5px] rounded-2xl px-3.5 py-3 ${
          right ? "bg-teal" : "bg-surface-2"
        }`}
      >
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            data-dot={d}
            className={`h-[7px] w-[7px] rounded-full ${right ? "bg-abyss/60" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Phone({
  preset,
  screenMinHeight,
  screenHeight,
  typingBefore = [],
}: {
  preset: Preset;
  /* Forces a full-device screen height so a short thread still reads as a real
     phone. Used by the OG composition, which crops the device at the frame. */
  screenMinHeight?: number;
  /* Fixed screen height reserving the settled thread, so bubbles can anchor to
     the bottom and clientHeight never changes between beats. */
  screenHeight?: number;
  /* Bubble indices that get a typing indicator rendered before them. */
  typingBefore?: number[];
}) {
  const thread = preset.thread;
  const typing = new Set(typingBefore);
  /* Bottom-anchor only when the height is reserved for playback. The OG crop
     uses screenMinHeight and wants the conversation to start at the top. */
  const anchorBottom = screenHeight != null;

  return (
    <div className="w-[390px] max-w-full shrink-0">
      {/* Bezel */}
      <div
        className="relative rounded-[2.75rem] bg-[#05090F] p-[10px] ring-1 ring-inset ring-line/60"
        style={{ boxShadow: "0 44px 90px -28px rgba(0,0,0,0.9), 0 8px 28px -12px rgba(0,0,0,0.7)" }}
      >
        {/* Screen */}
        <div
          data-phone-screen
          className="relative flex flex-col overflow-hidden rounded-[2.15rem] bg-[#0A1526]"
          style={{ height: screenHeight, minHeight: screenMinHeight }}
        >
          {/* Notch */}
          <div className="absolute left-1/2 top-0 z-20 h-[26px] w-[120px] -translate-x-1/2 rounded-b-[14px] bg-[#05090F]" />

          {/* Status row */}
          <div className="relative z-10 flex h-[36px] shrink-0 items-center justify-between px-6 pt-1">
            <span className="text-[13px] font-semibold tabular-nums text-ink">
              {COPY.chrome.phone.statusTime}
            </span>
            <span className="flex items-center gap-[6px] text-muted">
              <SignalGlyph />
              <WifiGlyph />
              <BatteryGlyph />
            </span>
          </div>

          {/* Contact header */}
          <div className="shrink-0 border-b border-line bg-surface-2 px-6 pb-3 pt-2 text-center">
            <div
              data-biz-name
              className="font-body text-[15px] font-semibold leading-tight text-ink"
            >
              {preset.bizName}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">{COPY.chrome.phone.threadLabel}</div>
          </div>

          {/* Thread viewport: fixed box, stack pinned to its bottom edge. */}
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-5 pt-4 ${
              anchorBottom ? "justify-end" : "justify-start"
            }`}
          >
            <div data-thread-area className="flex flex-col gap-1">
              {thread.map((b, i) => {
                const prev = thread[i - 1];
                const next = thread[i + 1];
                const senderChange = !prev || prev.from !== b.from;
                const runEnd = !next || next.from !== b.from;

                return (
                  <Fragment key={i}>
                    {typing.has(i) && <TypingRow index={i} right={b.from === "business"} />}

                    <div data-row={i} className="flex flex-col gap-1">
                      {senderChange && (
                        <div className="pb-1 pt-3 text-center text-[11px] tabular-nums text-muted">
                          {b.time}
                        </div>
                      )}

                      {b.from === "system" ? (
                        <div
                          data-bubble="system"
                          className="px-6 py-1 text-center text-[12px] uppercase tracking-wide text-muted"
                        >
                          {b.text}
                        </div>
                      ) : b.from === "business" ? (
                        <div className="flex justify-end">
                          <div
                            data-bubble="business"
                            className={`max-w-[78%] rounded-2xl bg-teal px-3.5 py-2 text-[14px] leading-snug text-abyss ${
                              runEnd ? "rounded-br-sm" : ""
                            }`}
                          >
                            {b.text}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-start">
                          <div
                            data-bubble="customer"
                            className={`max-w-[78%] rounded-2xl bg-surface-2 px-3.5 py-2 text-[14px] leading-snug text-ink ${
                              runEnd ? "rounded-bl-sm" : ""
                            }`}
                          >
                            {b.text}
                          </div>
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              })}

              <div data-delivered className="pr-1 pt-1 text-right text-[11px] text-muted">
                {COPY.chrome.phone.deliveredLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
