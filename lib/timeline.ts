/**
 * The one timeline. Every animated element derives from a single phase signal
 * (seconds since playback start) produced by the single rAF loop in Demo.tsx.
 * Nothing here schedules anything; these are pure coordinates.
 *
 * Change 11 rewires the opening to the CUSTOMER's point of view: she places
 * the call, nobody picks up, and the save arrives as a Messages banner. The
 * pre-existing thread timeline is untouched — its beats below stay
 * THREAD-RELATIVE, and the engine offsets them by THREAD_START.
 * Global clock:
 *   0.0-1.0    outgoing call screen, "calling…"
 *   1.0-3.6    "ringing…" — the ellipsis cycles at DOT_PERIOD. Nobody answers.
 *   3.6        "Call Ended", screen dims 30%, the End button fades; on
 *              mobile the page headline fades + rises in on the same beat
 *   4.4        a Messages banner slides down over the dead call screen
 *   5.2        400ms crossfade to the Messages thread
 *   5.6        the thread timeline's own t=0
 *   10.0       customer's closing bubble beat: the owner notification
 *   11.0       everything settled
 */

export const CALL_RINGING_AT = 1.0;
export const CALL_ENDED_AT = 3.6;
export const CALL_END_FADE_DUR = 0.4;
export const DOT_PERIOD = 0.4;
export const BANNER_AT = 4.4;
export const BANNER_IN = 0.3;
export const THREAD_FADE_AT = 5.2;
export const THREAD_FADE_DUR = 0.4;
export const THREAD_START = 5.6;

/** Mobile only — at >=1100px the headline is present from load (change 11):
 *  watch-then-read sequencing needs the phone alone on screen. */
export const HEADLINE_AT = 3.6;
export const HEADLINE_DUR = 0.5;
export const HEADLINE_RISE = 16;

/** Bubble index -> reveal time (seconds, THREAD-RELATIVE). Bubble 0 is the
 *  auto-text the banner already delivered at t=4.4 global — on her phone it
 *  is ALREADY in the thread when the crossfade lands, so its beat is 0
 *  (change 11 review: a banner means delivered; nothing re-types it). */
export const BEATS = [0, 2.2, 3.3, 4.0];

/** Typing indicators, keyed by the bubble index they precede. Only the
 *  business's SECOND message gets one — bubble 0 is pre-delivered, and you
 *  never see your own typing indicator (bubbles 1/3 are hers). */
export const TYPING = [{ before: 2, at: 2.9 }];

export const BUBBLE_ENTER = 0.24;
export const BUBBLE_RISE = 12;

export const DELIVERED_AT = 4.0;

/** The owner-side caught row: it slides in the beat the thread closes. */
export const CAUGHT_ROW_AT = 4.4;
export const CAUGHT_ROW_ENTER = 0.3;
export const CAUGHT_ROW_RISE = 12;

export const LEDGER_AT = 4.6;
export const LEDGER_DUR = 0.8;

/** The leak runs the whole thread: money leaves while one call is saved. */
export const LEAK_DUR = 5.4;

export const CONTROLS_AT = 5.4;
export const CONTROLS_FADE = 0.3;

/** Thread settles at 5.4 thread-relative = 11.0 global. */
export const SETTLED_AT = LEDGER_AT + LEDGER_DUR;

/** The owner notification: same beat as the caught-row insert (the two-sided
 *  moment), global clock. Slides in, holds, slides back out. */
export const NOTIFY_AT = THREAD_START + CAUGHT_ROW_AT; // 10.0
export const NOTIFY_IN = 0.3;
export const NOTIFY_HOLD = 2.4;
export const NOTIFY_OUT = 0.3;

/** One shimmer sweep across the gold recovered figure when its count-up
 *  completes. Driven by the rAF phase like everything else — not a CSS loop. */
export const SHIMMER_AT = THREAD_START + SETTLED_AT; // 11.0
export const SHIMMER_DUR = 0.6;

/** Loop far enough past the notification's exit (13.0) that gates can sample
 *  a fully settled t=13.3. */
export const LOOP_UNTIL = 13.8;

/** Preset crossfade: text dissolves through zero, numbers roll old -> beat 0. */
export const SWAP_FADE = 0.22;
export const SWAP_ROLL = 0.5;

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/* The counter curves, THREAD-RELATIVE (the engine passes t - THREAD_START).
   Exported so the preset switch can ask for the incoming preset's value *at
   beat 0* rather than hardcoding a zero, which keeps the transition target
   honest if the timeline ever moves. */
export const ledgerAt = (t: number, recovered: number) =>
  Math.round(easeOut(clamp01((t - LEDGER_AT) / LEDGER_DUR)) * recovered);

export const leakAt = (t: number, lost: number) => Math.round(clamp01(t / LEAK_DUR) * lost);

/**
 * The owner panel's Recovered tile. It does NOT climb from zero: the three
 * standing rows already account for (recovered - row0Amount), so the panel
 * opens showing that partial total and rolls the remaining row0Amount in when
 * the row slides in at CAUGHT_ROW_AT / rolls at LEDGER_AT. This is the causal
 * link the whole change is built around — the thread closing IS the roll.
 */
export const panelRecoveredAt = (t: number, recovered: number, row0Amount: number) => {
  const base = recovered - row0Amount;
  return Math.round(base + easeOut(clamp01((t - LEDGER_AT) / LEDGER_DUR)) * row0Amount);
};

/** Reveal progress (0-1) for the caught-list row that slides in. Thread-relative. */
export const caughtRowProgress = (t: number) => easeOut(clamp01((t - CAUGHT_ROW_AT) / CAUGHT_ROW_ENTER));

/** Presence (0-1) of the owner notification at GLOBAL time t: slide-in, hold,
 *  slide-out, gone. */
export function notifyPresence(t: number) {
  if (t < NOTIFY_AT) return 0;
  const e = t - NOTIFY_AT;
  if (e < NOTIFY_IN) return easeOut(e / NOTIFY_IN);
  if (e < NOTIFY_IN + NOTIFY_HOLD) return 1;
  if (e < NOTIFY_IN + NOTIFY_HOLD + NOTIFY_OUT)
    return 1 - easeOut((e - NOTIFY_IN - NOTIFY_HOLD) / NOTIFY_OUT);
  return 0;
}
